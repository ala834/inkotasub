// Public Developer API
// Authentication: Authorization: Bearer ink_live_xxx
// Endpoints (path after /developer-api):
//   GET  /balance
//   GET  /service-plans?service_type=data&network=mtn  (preferred catalog)
//   GET  /data-plans?network=mtn                       (legacy alias)
//   POST /buy-airtime    { network, phone, amount }
//   POST /buy-data       { network, phone, plan_id }
//   POST /buy-cable      { provider, smartcard, plan_id }
//   POST /buy-electricity { disco, meter, meter_type, amount }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hashApiKey } from "../_shared/api-key-utils.ts";
import { subpadiPurchaseAirtime } from "../_shared/subpadi-provider.ts";
import { smeplugPurchaseAirtime } from "../_shared/smeplug-provider.ts";
import { clubkonnectPurchaseAirtime } from "../_shared/clubkonnect-provider.ts";
import { renderPurchaseAirtime } from "../_shared/render-provider.ts";
import { executeWithFallback } from "../_shared/provider-fallback.ts";
import { normalizePhone, detectNetwork } from "../_shared/phone-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---- in-memory rate limit (best-effort) ----
const rateStore = new Map<string, { count: number; resetAt: number }>();
function rateLimit(keyId: string, limit: number) {
  const now = Date.now();
  const entry = rateStore.get(keyId);
  if (!entry || now > entry.resetAt) {
    rateStore.set(keyId, { count: 1, resetAt: now + 60_000 });
    return { allowed: true };
  }
  if (entry.count >= limit) return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  entry.count++;
  return { allowed: true };
}

async function logRequest(
  admin: ReturnType<typeof createClient>,
  data: {
    user_id: string | null;
    api_key_id: string | null;
    endpoint: string;
    method: string;
    status_code: number;
    success: boolean;
    response_time_ms: number;
    ip_address: string | null;
    user_agent: string | null;
    request_body?: unknown;
    response_body?: unknown;
    error_message?: string;
  },
) {
  try {
    await admin.from("api_request_logs").insert({
      ...data,
      request_body: data.request_body ?? null,
      response_body: data.response_body ?? null,
      error_message: data.error_message ?? null,
    });
  } catch (e) {
    console.error("api log insert failed:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const url = new URL(req.url);
  // strip "/developer-api" prefix
  const path = url.pathname.replace(/^.*\/developer-api/, "") || "/";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
  const userAgent = req.headers.get("user-agent") || null;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- Auth ----
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    const body = { error: "Missing API key. Send 'Authorization: Bearer YOUR_KEY' header.", success: false };
    await logRequest(admin, { user_id: null, api_key_id: null, endpoint: path, method: req.method, status_code: 401, success: false, response_time_ms: Date.now() - startedAt, ip_address: ip, user_agent: userAgent, response_body: body, error_message: "missing_auth" });
    return json(body, 401);
  }
  const rawKey = authHeader.slice(7).trim();
  if (!rawKey.startsWith("ink_live_")) {
    const body = { error: "Invalid API key format.", success: false };
    await logRequest(admin, { user_id: null, api_key_id: null, endpoint: path, method: req.method, status_code: 401, success: false, response_time_ms: Date.now() - startedAt, ip_address: ip, user_agent: userAgent, response_body: body, error_message: "invalid_format" });
    return json(body, 401);
  }
  const keyHash = await hashApiKey(rawKey);
  const { data: keyRow } = await admin.from("api_keys").select("*").eq("key_hash", keyHash).maybeSingle();
  if (!keyRow || keyRow.is_revoked) {
    const body = { error: "Invalid or revoked API key.", success: false };
    await logRequest(admin, { user_id: null, api_key_id: null, endpoint: path, method: req.method, status_code: 401, success: false, response_time_ms: Date.now() - startedAt, ip_address: ip, user_agent: userAgent, response_body: body, error_message: "invalid_key" });
    return json(body, 401);
  }

  const userId = keyRow.user_id as string;
  const keyId = keyRow.id as string;
  const limit = keyRow.rate_limit_per_min as number;

  // ---- Rate limit ----
  const rl = rateLimit(keyId, limit);
  if (!rl.allowed) {
    const body = { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.`, success: false, retryAfter: rl.retryAfter };
    await logRequest(admin, { user_id: userId, api_key_id: keyId, endpoint: path, method: req.method, status_code: 429, success: false, response_time_ms: Date.now() - startedAt, ip_address: ip, user_agent: userAgent, response_body: body, error_message: "rate_limited" });
    return json(body, 429);
  }

  // touch last_used_at (fire-and-forget)
  admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId).then(() => {});

  let parsedBody: any = null;
  if (req.method === "POST") {
    try { parsedBody = await req.json(); } catch { parsedBody = {}; }
  }

  let response: { status: number; body: any };

  try {
    if (path === "/balance" && req.method === "GET") {
      const { data: w } = await admin.from("api_wallets").select("balance").eq("user_id", userId).maybeSingle();
      response = { status: 200, body: { success: true, balance: Number(w?.balance ?? 0), currency: "NGN" } };
    } else if (path === "/service-plans" && req.method === "GET") {
      response = await listServicePlans(admin, url);
    } else if (path === "/data-plans" && req.method === "GET") {
      // legacy alias — only data
      const u = new URL(url.toString());
      u.searchParams.set("service_type", "data");
      response = await listServicePlans(admin, u);
    } else if (path === "/buy-airtime" && req.method === "POST") {
      response = await buyAirtime(admin, userId, parsedBody);
    } else if (path === "/buy-data" && req.method === "POST") {
      response = await buyData(admin, userId, parsedBody);
    } else if (path === "/buy-cable" && req.method === "POST") {
      response = await buyCable(admin, userId, parsedBody);
    } else if (path === "/buy-electricity" && req.method === "POST") {
      response = await buyElectricity(admin, userId, parsedBody);
    } else {
      response = { status: 404, body: { success: false, error: `Unknown endpoint: ${req.method} ${path}` } };
    }
  } catch (err) {
    console.error("developer-api error:", err);
    response = { status: 500, body: { success: false, error: err instanceof Error ? err.message : "Internal error" } };
  }

  await logRequest(admin, {
    user_id: userId,
    api_key_id: keyId,
    endpoint: path,
    method: req.method,
    status_code: response.status,
    success: response.body?.success === true,
    response_time_ms: Date.now() - startedAt,
    ip_address: ip,
    user_agent: userAgent,
    request_body: parsedBody,
    response_body: response.body,
    error_message: response.body?.success === false ? response.body?.error : undefined,
  });

  return json(response.body, response.status);
});

// ---- Catalog ----
async function listServicePlans(admin: any, url: URL): Promise<{ status: number; body: any }> {
  const serviceType = url.searchParams.get("service_type")?.toLowerCase();
  const network = url.searchParams.get("network")?.toLowerCase();
  const provider = url.searchParams.get("provider")?.toLowerCase();

  let q = admin
    .from("developer_api_plans")
    .select("plan_id, plan_name, service_type, network, provider_source, developer_price, user_price, reseller_price, validation_id, is_enabled, is_hidden_from_users, sort_order")
    .eq("is_enabled", true)
    .eq("is_hidden_from_users", false);

  if (serviceType) q = q.eq("service_type", serviceType);
  if (network) q = q.ilike("network", network);
  if (provider) q = q.eq("provider_source", provider);

  const { data, error } = await q.order("sort_order", { ascending: true }).order("developer_price", { ascending: true });
  if (error) return { status: 500, body: { success: false, error: error.message } };

  return {
    status: 200,
    body: {
      success: true,
      count: data?.length ?? 0,
      currency: "NGN",
      plans: (data ?? []).map((p: any) => ({
        plan_id: p.plan_id,
        plan_name: p.plan_name,
        service_type: p.service_type,
        network: p.network,
        provider: p.provider_source,
        validation_id: p.validation_id,
        price: Number(p.developer_price),
        user_price: Number(p.user_price),
        reseller_price: Number(p.reseller_price),
      })),
    },
  };
}

// ---- Wallet helpers ----
async function getApiServiceCharge(admin: any): Promise<number> {
  try {
    const { data } = await admin.from("app_settings").select("value").eq("key", "api_service_charge").maybeSingle();
    const n = Number(data?.value ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}

async function debitApiWallet(admin: any, userId: string, amount: number, reference: string, metadata: any) {
  const { data: balanceBefore } = await admin.rpc("get_api_wallet_balance", { p_user_id: userId });
  const { data: newBalance, error } = await admin.rpc("atomic_api_wallet_debit", { p_user_id: userId, p_amount: amount });
  if (error) throw new Error(error.message === "insufficient_api_balance" ? "Insufficient API wallet balance" : error.message);
  await admin.from("api_wallet_ledger").insert({
    user_id: userId, entry_type: "debit", amount, balance_before: Number(balanceBefore ?? 0), balance_after: Number(newBalance), reference, metadata,
  });
  return Number(newBalance);
}

async function refundApiWallet(admin: any, userId: string, amount: number, reference: string, metadata: any) {
  const { data: balanceBefore } = await admin.rpc("get_api_wallet_balance", { p_user_id: userId });
  const { data: newBalance } = await admin.rpc("atomic_api_wallet_credit", { p_user_id: userId, p_amount: amount });
  await admin.from("api_wallet_ledger").insert({
    user_id: userId, entry_type: "credit", amount, balance_before: Number(balanceBefore ?? 0), balance_after: Number(newBalance), reference, metadata: { ...metadata, refund: true },
  });
}

// ---- Plan failure tracking ----
async function recordPlanResult(admin: any, planRow: any, success: boolean, reason?: string) {
  if (!planRow?.id) return;
  try {
    if (success) {
      await admin.from("developer_api_plans").update({
        last_success_at: new Date().toISOString(),
        failure_count: 0,
        last_failure_reason: null,
      }).eq("id", planRow.id);
    } else {
      const newFailureCount = (planRow.failure_count ?? 0) + 1;
      const shouldHide = planRow.auto_hide_on_failure && newFailureCount >= 3;
      await admin.from("developer_api_plans").update({
        failure_count: newFailureCount,
        last_failure_at: new Date().toISOString(),
        last_failure_reason: reason ?? "Provider failed",
        is_hidden_from_users: shouldHide ? true : planRow.is_hidden_from_users,
      }).eq("id", planRow.id);
    }
  } catch (e) {
    console.error("recordPlanResult failed:", e);
  }
}

// ---- Endpoints ----
async function buyAirtime(admin: any, userId: string, body: any): Promise<{ status: number; body: any }> {
  const phoneRaw = String(body?.phone ?? "").trim();
  const amount = Number(body?.amount);
  let network = String(body?.network ?? "").toLowerCase();

  const phone = normalizePhone(phoneRaw);
  if (!phone) return { status: 400, body: { success: false, error: `Invalid phone number: ${phoneRaw}. Use 234XXXXXXXXXX format.` } };
  if (!amount || amount < 50) return { status: 400, body: { success: false, error: "amount is required (minimum ₦50)" } };
  if (!network || !["mtn","glo","airtel","9mobile"].includes(network)) {
    const detected = detectNetwork(phone.local);
    if (!detected) return { status: 400, body: { success: false, error: "Invalid or undetectable network" } };
    network = detected;
  }

  const reference = `api_air_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await debitApiWallet(admin, userId, amount, reference, { service: "airtime", network, phone: phone.intl, amount });

  // 9mobile airtime is fragile — explicit chain prefers Subpadi → SMEPlug → ClubKonnect
  const providerChain = network === "9mobile"
    ? ["subpadi", "smeplug", "clubkonnect"]
    : undefined;

  try {
    const result = await executeWithFallback(
      () => subpadiPurchaseAirtime(network, phone.intl, amount),
      () => smeplugPurchaseAirtime(network, phone.intl, amount),
      "airtime",
      network,
      providerChain ? { providerChain } : { preferredProvider: "smeplug" },
      () => clubkonnectPurchaseAirtime(network, phone.intl, amount),
      () => renderPurchaseAirtime(network, phone.intl, amount),
    );

    if (result.success) {
      return {
        status: 200,
        body: {
          success: true, reference, network, phone: phone.intl, amount,
          provider: result.providerUsed,
          provider_message: result.message,
          fallback_attempted: result.fallbackAttempted,
        },
      };
    }

    if (result.indeterminate) {
      // Keep the debit; mark as pending so reconciliation can resolve it
      return {
        status: 202,
        body: {
          success: false, pending: true, reference, network, phone: phone.intl, amount,
          provider: result.providerUsed,
          message: "Processing — transaction will be confirmed shortly.",
        },
      };
    }

    await refundApiWallet(admin, userId, amount, reference, { service: "airtime", reason: result.message });
    return { status: 502, body: { success: false, error: "Service temporarily unavailable, please try again.", reference, refunded: true } };
  } catch (err) {
    await refundApiWallet(admin, userId, amount, reference, { service: "airtime", reason: String(err) });
    return { status: 502, body: { success: false, error: "Service temporarily unavailable, please try again.", reference, refunded: true } };
  }
}

async function buyData(admin: any, userId: string, body: any): Promise<{ status: number; body: any }> {
  const phoneRaw = String(body?.phone ?? "").trim();
  const planId = String(body?.plan_id ?? "").trim();
  let network = String(body?.network ?? "").toLowerCase();

  const phone = normalizePhone(phoneRaw);
  if (!phone) return { status: 400, body: { success: false, error: `Invalid phone number: ${phoneRaw}. Use 234XXXXXXXXXX format.` } };
  if (!planId) return { status: 400, body: { success: false, error: "plan_id is required" } };
  if (!network) {
    const detected = detectNetwork(phone.local);
    if (!detected) return { status: 400, body: { success: false, error: "Could not detect network" } };
    network = detected;
  }

  // 1) Look up the plan in developer_api_plans (preferred)
  const { data: devPlan } = await admin
    .from("developer_api_plans")
    .select("*")
    .eq("plan_id", planId)
    .eq("service_type", "data")
    .eq("is_enabled", true)
    .eq("is_hidden_from_users", false)
    .maybeSingle();

  // 2) Fallback to the global service_plans catalog
  let amount: number;
  let resolvedProvider: string | undefined;
  let planRowForTracking: any = null;
  if (devPlan) {
    if (devPlan.network && devPlan.network.toLowerCase() !== network) {
      return { status: 400, body: { success: false, error: `Plan is for ${devPlan.network}, not ${network}` } };
    }
    amount = Number(devPlan.developer_price);
    resolvedProvider = (devPlan.provider_source || "").toLowerCase() || undefined;
    planRowForTracking = devPlan;
  } else {
    const { data: legacy } = await admin
      .from("service_plans")
      .select("*")
      .eq("plan_id", planId)
      .eq("service_type", "data")
      .eq("is_enabled", true)
      .eq("permanently_disabled", false)
      .maybeSingle();
    if (!legacy) return { status: 404, body: { success: false, error: "Plan not found or unavailable" } };
    if (legacy.network?.toLowerCase() !== network) return { status: 400, body: { success: false, error: `Plan is for ${legacy.network}, not ${network}` } };
    amount = Number(legacy.selling_price ?? legacy.base_price);
    resolvedProvider = (legacy.provider || "").toLowerCase() || undefined;
  }

  const reference = `api_data_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await debitApiWallet(admin, userId, amount, reference, {
    service: "data", network, phone: phone.intl, plan_id: planId, amount, provider_hint: resolvedProvider,
  });

  // Forward to internal purchase-data — pass smart-routing hints
  try {
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/purchase-data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-api-internal": "1",
        "x-api-user-id": userId,
      },
      body: JSON.stringify({
        network,
        phoneNumber: phone.intl,
        planId,
        amount,
        viaApi: true,
        preferredProvider: resolvedProvider,
      }),
    });
    const data = await resp.json();

    if (resp.ok && data.success) {
      await recordPlanResult(admin, planRowForTracking, true);
      return {
        status: 200,
        body: {
          success: true, reference, network, phone: phone.intl, plan_id: planId, amount,
          provider: data.provider ?? resolvedProvider,
          message: "Data purchased successfully",
        },
      };
    }

    // Pending / indeterminate — do not refund
    if (resp.status === 202 || data?.pending) {
      return {
        status: 202,
        body: {
          success: false, pending: true, reference, network, phone: phone.intl, plan_id: planId, amount,
          message: "Processing — transaction will be confirmed shortly.",
        },
      };
    }

    await recordPlanResult(admin, planRowForTracking, false, data?.error);
    await refundApiWallet(admin, userId, amount, reference, { service: "data", reason: data?.error });
    return { status: 502, body: { success: false, error: data?.error ?? "Service temporarily unavailable, please try again.", reference, refunded: true } };
  } catch (err) {
    await refundApiWallet(admin, userId, amount, reference, { service: "data", reason: String(err) });
    return { status: 502, body: { success: false, error: "Service temporarily unavailable, please try again.", reference, refunded: true } };
  }
}

async function buyCable(admin: any, userId: string, body: any): Promise<{ status: number; body: any }> {
  const provider = String(body?.provider ?? "").toLowerCase();
  const smartcard = String(body?.smartcard ?? "").trim();
  const planId = String(body?.plan_id ?? "").trim();
  if (!provider || !smartcard || !planId) return { status: 400, body: { success: false, error: "provider, smartcard, plan_id required" } };

  // Prefer developer_api_plans
  const { data: devPlan } = await admin
    .from("developer_api_plans")
    .select("*")
    .eq("plan_id", planId)
    .eq("service_type", "cable")
    .eq("is_enabled", true)
    .eq("is_hidden_from_users", false)
    .maybeSingle();

  let amount: number;
  if (devPlan) {
    amount = Number(devPlan.developer_price);
  } else {
    const { data: legacy } = await admin.from("service_plans").select("*").eq("plan_id", planId).eq("service_type", "cable").eq("is_enabled", true).maybeSingle();
    if (!legacy) return { status: 404, body: { success: false, error: "Cable plan not found" } };
    amount = Number(legacy.selling_price ?? legacy.base_price);
  }

  const reference = `api_cable_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await debitApiWallet(admin, userId, amount, reference, { service: "cable", provider, smartcard, plan_id: planId, amount });

  try {
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/purchase-cable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "x-api-internal": "1", "x-api-user-id": userId },
      body: JSON.stringify({ provider, smartcardNumber: smartcard, planId, amount, viaApi: true }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) {
      if (resp.status === 202 || data?.pending) {
        return { status: 202, body: { success: false, pending: true, reference, message: "Processing — will be confirmed shortly." } };
      }
      await recordPlanResult(admin, devPlan, false, data?.error);
      await refundApiWallet(admin, userId, amount, reference, { service: "cable", reason: data.error });
      return { status: 502, body: { success: false, error: data.error ?? "Service temporarily unavailable, please try again.", reference, refunded: true } };
    }
    await recordPlanResult(admin, devPlan, true);
    return { status: 200, body: { success: true, reference, provider, smartcard, plan_id: planId, amount } };
  } catch (err) {
    await refundApiWallet(admin, userId, amount, reference, { service: "cable", reason: String(err) });
    return { status: 502, body: { success: false, error: "Service temporarily unavailable, please try again.", reference, refunded: true } };
  }
}

async function buyElectricity(admin: any, userId: string, body: any): Promise<{ status: number; body: any }> {
  const disco = String(body?.disco ?? "").trim();
  const meter = String(body?.meter ?? "").trim();
  const meterType = String(body?.meter_type ?? "prepaid").toLowerCase();
  const amount = Number(body?.amount);
  if (!disco || !meter || !amount || amount < 500) return { status: 400, body: { success: false, error: "disco, meter, meter_type, amount (min 500) required" } };

  const reference = `api_elec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await debitApiWallet(admin, userId, amount, reference, { service: "electricity", disco, meter, meterType, amount });

  try {
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/purchase-electricity`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "x-api-internal": "1", "x-api-user-id": userId },
      body: JSON.stringify({ disco, meterNumber: meter, meterType, amount, viaApi: true }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) {
      if (resp.status === 202 || data?.pending) {
        return { status: 202, body: { success: false, pending: true, reference, message: "Processing — will be confirmed shortly." } };
      }
      await refundApiWallet(admin, userId, amount, reference, { service: "electricity", reason: data.error });
      return { status: 502, body: { success: false, error: data.error ?? "Service temporarily unavailable, please try again.", reference, refunded: true } };
    }
    return { status: 200, body: { success: true, reference, disco, meter, amount, token: data.token, units: data.units } };
  } catch (err) {
    await refundApiWallet(admin, userId, amount, reference, { service: "electricity", reason: String(err) });
    return { status: 502, body: { success: false, error: "Service temporarily unavailable, please try again.", reference, refunded: true } };
  }
}
