// Public Developer API
// Authentication: Authorization: Bearer ink_live_xxx
// Endpoints (path after /developer-api):
//   GET  /balance
//   GET  /data-plans?network=mtn
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

function detectNetwork(phone: string): string | null {
  const prefixes: Record<string, string[]> = {
    mtn: ["0803","0806","0703","0706","0813","0816","0810","0814","0903","0906","0913","0916","0704"],
    airtel: ["0802","0808","0708","0812","0701","0902","0901","0907","0912"],
    glo: ["0805","0807","0705","0815","0811","0905","0915"],
    "9mobile": ["0809","0818","0817","0909","0908"],
  };
  let n = phone.replace(/\D/g, "");
  if (n.startsWith("234") && n.length === 13) n = "0" + n.slice(3);
  const p4 = n.slice(0, 4);
  for (const [net, list] of Object.entries(prefixes)) {
    if (list.includes(p4)) return net;
  }
  return null;
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
    } else if (path === "/data-plans" && req.method === "GET") {
      const network = url.searchParams.get("network")?.toLowerCase();
      let q = admin.from("service_plans").select("plan_id, plan_name, network, plan_type, base_price, selling_price, validity, provider").eq("service_type", "data").eq("is_enabled", true).eq("permanently_disabled", false).lt("failure_count", 2);
      if (network) q = q.eq("network", network.toUpperCase());
      const { data: plans, error } = await q.order("base_price", { ascending: true });
      if (error) throw error;
      response = { status: 200, body: { success: true, count: plans?.length ?? 0, plans: plans ?? [] } };
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

// ---- Wallet helpers ----
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

// ---- Endpoints ----
async function buyAirtime(admin: any, userId: string, body: any): Promise<{ status: number; body: any }> {
  const phone = String(body?.phone ?? "").trim();
  const amount = Number(body?.amount);
  let network = String(body?.network ?? "").toLowerCase();
  if (!phone || !amount || amount < 50) return { status: 400, body: { success: false, error: "phone and amount (min 50) are required" } };
  if (!network || !["mtn","glo","airtel","9mobile"].includes(network)) {
    const detected = detectNetwork(phone);
    if (!detected) return { status: 400, body: { success: false, error: "Invalid or undetectable network" } };
    network = detected;
  }

  const reference = `api_air_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await debitApiWallet(admin, userId, amount, reference, { service: "airtime", network, phone, amount });

  try {
    const result = await executeWithFallback(
      () => subpadiPurchaseAirtime(network, phone, amount),
      () => smeplugPurchaseAirtime(network, phone, amount),
      "airtime",
      network,
      { preferredProvider: "smeplug" },
      () => clubkonnectPurchaseAirtime(network, phone, amount),
      () => renderPurchaseAirtime(network, phone, amount),
    );
    if (!result.success) {
      await refundApiWallet(admin, userId, amount, reference, { service: "airtime", reason: result.message });
      return { status: 502, body: { success: false, error: result.message ?? "Provider failed", reference, refunded: true } };
    }
    return { status: 200, body: { success: true, reference, network, phone, amount, provider: result.providerUsed, message: result.message } };
  } catch (err) {
    await refundApiWallet(admin, userId, amount, reference, { service: "airtime", reason: String(err) });
    return { status: 502, body: { success: false, error: err instanceof Error ? err.message : "Provider error", reference, refunded: true } };
  }
}

async function buyData(admin: any, userId: string, body: any): Promise<{ status: number; body: any }> {
  const phone = String(body?.phone ?? "").trim();
  const planId = String(body?.plan_id ?? "").trim();
  let network = String(body?.network ?? "").toLowerCase();
  if (!phone || !planId) return { status: 400, body: { success: false, error: "phone and plan_id are required" } };
  if (!network) {
    const detected = detectNetwork(phone);
    if (!detected) return { status: 400, body: { success: false, error: "Could not detect network" } };
    network = detected;
  }
  // Look up plan
  const { data: plan } = await admin.from("service_plans").select("*").eq("plan_id", planId).eq("service_type", "data").eq("is_enabled", true).eq("permanently_disabled", false).maybeSingle();
  if (!plan) return { status: 404, body: { success: false, error: "Plan not found or unavailable" } };
  if (plan.network.toLowerCase() !== network) return { status: 400, body: { success: false, error: `Plan is for ${plan.network}, not ${network}` } };

  const amount = Number(plan.selling_price ?? plan.base_price);
  const reference = `api_data_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await debitApiWallet(admin, userId, amount, reference, { service: "data", network, phone, plan_id: planId, amount });

  try {
    // Forward to internal purchase-data via service-role token
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/purchase-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "x-api-internal": "1", "x-api-user-id": userId },
      body: JSON.stringify({ network, phoneNumber: phone, planId, amount, viaApi: true }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) {
      await refundApiWallet(admin, userId, amount, reference, { service: "data", reason: data.error });
      return { status: 502, body: { success: false, error: data.error ?? "Provider failed", reference, refunded: true } };
    }
    return { status: 200, body: { success: true, reference, network, phone, plan_id: planId, amount, message: "Data purchased successfully" } };
  } catch (err) {
    await refundApiWallet(admin, userId, amount, reference, { service: "data", reason: String(err) });
    return { status: 502, body: { success: false, error: err instanceof Error ? err.message : "Provider error", reference, refunded: true } };
  }
}

async function buyCable(admin: any, userId: string, body: any): Promise<{ status: number; body: any }> {
  const provider = String(body?.provider ?? "").toLowerCase();
  const smartcard = String(body?.smartcard ?? "").trim();
  const planId = String(body?.plan_id ?? "").trim();
  if (!provider || !smartcard || !planId) return { status: 400, body: { success: false, error: "provider, smartcard, plan_id required" } };

  const { data: plan } = await admin.from("service_plans").select("*").eq("plan_id", planId).eq("service_type", "cable").eq("is_enabled", true).maybeSingle();
  if (!plan) return { status: 404, body: { success: false, error: "Cable plan not found" } };

  const amount = Number(plan.selling_price ?? plan.base_price);
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
      await refundApiWallet(admin, userId, amount, reference, { service: "cable", reason: data.error });
      return { status: 502, body: { success: false, error: data.error ?? "Provider failed", reference, refunded: true } };
    }
    return { status: 200, body: { success: true, reference, provider, smartcard, plan_id: planId, amount } };
  } catch (err) {
    await refundApiWallet(admin, userId, amount, reference, { service: "cable", reason: String(err) });
    return { status: 502, body: { success: false, error: err instanceof Error ? err.message : "Provider error", reference, refunded: true } };
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
      await refundApiWallet(admin, userId, amount, reference, { service: "electricity", reason: data.error });
      return { status: 502, body: { success: false, error: data.error ?? "Provider failed", reference, refunded: true } };
    }
    return { status: 200, body: { success: true, reference, disco, meter, amount, token: data.token, units: data.units } };
  } catch (err) {
    await refundApiWallet(admin, userId, amount, reference, { service: "electricity", reason: String(err) });
    return { status: 502, body: { success: false, error: err instanceof Error ? err.message : "Provider error", reference, refunded: true } };
  }
}
