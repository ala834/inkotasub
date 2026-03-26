import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { subpadiPurchaseElectricity, isSubpadiConfigured } from "../_shared/subpadi-provider.ts";
import { checkAndRewardFirstTransaction } from "../_shared/referral-reward.ts";
import { comparePin, needsPinMigration, hashPin } from "../_shared/pin-utils.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { checkFraud, fraudBlockResponse } from "../_shared/fraud-detection.ts";
import { recordTransactionLedger } from "../_shared/ledger.ts";
import { withMetrics } from "../_shared/provider-metrics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash = hash & hash; }
  return hash;
}

const discoMapping: Record<string, string> = {
  "ikeja": "ikeja-electric", "eko": "eko-electric", "abuja": "abuja-electric",
  "kano": "kano-electric", "port-harcourt": "portharcourt-electric",
  "ibadan": "ibadan-electric", "kaduna": "kaduna-electric", "jos": "jos-electric",
  "enugu": "enugu-electric", "benin": "benin-electric", "yola": "yola-electric",
};

async function smeplugPurchaseElectricity(discoCode: string, meterNumber: string, amount: number, meterType: string) {
  const apiKey = Deno.env.get("SMEPLUG_API_KEY");
  if (!apiKey) return { success: false, message: "Service not configured", rawResponse: null, token: null };
  try {
    const response = await fetch("https://smeplug.ng/api/v1/electricity/purchase", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: discoCode, meter_number: meterNumber, meter_type: meterType.toLowerCase(), amount }),
    });
    const data = await response.json();
    const success = data?.status === "success" || data?.success === true;
    const token = data?.data?.token || data?.token;
    return { success, message: data?.message || (success ? "Electricity purchased" : "Purchase failed"), rawResponse: data, token };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null, token: null };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userId = user.id;
    const rateCheck = checkRateLimit(userId, "purchase-electricity", { maxRequests: 5, windowMs: 60000 });
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { disco, meterNumber, meterType, amount, customerName, transaction_pin: transactionPin } = await req.json();

    const fraudCheck = await checkFraud(userId, 'electricity', amount);
    if (!fraudCheck.allowed) return fraudBlockResponse(fraudCheck.reason!, corsHeaders);

    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: profile } = await adminSupabase.from("profiles").select("is_agent, transaction_pin, failed_pin_attempts, pin_locked_until").eq("user_id", userId).single();
    if (profile?.pin_locked_until && new Date(profile.pin_locked_until) > new Date()) {
      return new Response(JSON.stringify({ error: "Account locked due to too many failed PIN attempts.", success: false }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (profile?.transaction_pin) {
      if (!transactionPin) return new Response(JSON.stringify({ error: "Transaction PIN required", requiresPin: true, success: false }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const pinValid = await comparePin(transactionPin, profile.transaction_pin);
      if (!pinValid) {
        const newAttempts = (profile.failed_pin_attempts || 0) + 1;
        const lockUntil = newAttempts >= 3 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
        await adminSupabase.from("profiles").update({ failed_pin_attempts: newAttempts, pin_locked_until: lockUntil }).eq("user_id", userId);
        return new Response(JSON.stringify({ error: newAttempts >= 3 ? "Account locked for 30 minutes" : "Invalid transaction PIN", attemptsRemaining: Math.max(0, 3 - newAttempts), success: false }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const updates: Record<string, any> = { failed_pin_attempts: 0, pin_locked_until: null };
      if (needsPinMigration(profile.transaction_pin)) updates.transaction_pin = await hashPin(transactionPin);
      if (profile.failed_pin_attempts > 0 || needsPinMigration(profile.transaction_pin)) await adminSupabase.from("profiles").update(updates).eq("user_id", userId);
    }

    const isAgent = profile?.is_agent || false;
    const userType = isAgent ? 'agent' : 'user';
    const { data: pricingConfigs } = await adminSupabase.from("pricing_config").select("*").eq("service_type", "electricity").eq("is_active", true).eq("user_type", userType);
    const config = pricingConfigs?.find(c => c.network === disco.toUpperCase() && !c.plan_id) || pricingConfigs?.find(c => !c.network && !c.plan_id);

    let costPrice = amount;
    let serviceCharge = 0;
    if (config) {
      serviceCharge = config.profit_type === 'percentage' ? Math.round(amount * config.profit_value / 100) : config.profit_value;
    }
    const sellingPrice = amount + serviceCharge;
    const profit = serviceCharge;

    if (costPrice >= sellingPrice && config && serviceCharge <= 0) {
      return new Response(JSON.stringify({ error: "Service temporarily unavailable.", success: false }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Advisory lock
    const { data: lockAcquired } = await adminSupabase.rpc("try_advisory_lock", { lock_key: Math.abs(hashString(userId)) });
    if (!lockAcquired) return new Response(JSON.stringify({ error: "Another transaction is being processed.", success: false }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: wallet } = await adminSupabase.from("wallets").select("balance").eq("user_id", userId).single();
    if (!wallet) throw new Error("Wallet not found");
    const currentBalance = parseFloat(wallet.balance as unknown as string);
    if (currentBalance < sellingPrice) return new Response(JSON.stringify({ error: "Insufficient balance", success: false }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const reference = `ELEC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newBalance = currentBalance - sellingPrice;
    const discoCode = discoMapping[disco.toLowerCase()] || disco.toLowerCase();

    const { data: transaction, error: txError } = await adminSupabase.from("transactions").insert({
      user_id: userId, type: "debit", amount: sellingPrice, balance_before: currentBalance, balance_after: newBalance,
      status: "pending", reference, description: `Electricity - ${disco.toUpperCase()} - ${meterNumber}`,
      metadata: { serviceCharge, unitAmount: amount, meterType, customerName },
    }).select().single();
    if (txError) throw txError;

    let apiSuccess = false;
    let providerUsed = 'subpadi';
    let fallbackAttempted = false;
    let apiResponse: unknown = null;
    let fallbackResponse: unknown = null;
    let electricityToken: string | null = null;

    if (isSubpadiConfigured()) {
      const subpadiResult = await withMetrics('subpadi', 'electricity', () => subpadiPurchaseElectricity(discoCode, meterNumber, costPrice, meterType), r => r.success && !!r.token);
      apiResponse = subpadiResult.rawResponse;
      if (subpadiResult.success && subpadiResult.token) {
        apiSuccess = true; electricityToken = subpadiResult.token;
      } else {
        fallbackAttempted = true;
        const smeplugResult = await withMetrics('smeplug', 'electricity', () => smeplugPurchaseElectricity(discoCode, meterNumber, costPrice, meterType), r => r.success && !!r.token);
        fallbackResponse = smeplugResult.rawResponse;
        if (smeplugResult.success && smeplugResult.token) { apiSuccess = true; electricityToken = smeplugResult.token; providerUsed = 'smeplug'; }
      }
    } else {
      const smeplugResult = await withMetrics('smeplug', 'electricity', () => smeplugPurchaseElectricity(discoCode, meterNumber, costPrice, meterType), r => r.success);
      apiResponse = smeplugResult.rawResponse; providerUsed = 'smeplug'; apiSuccess = smeplugResult.success; electricityToken = smeplugResult.token;
    }

    if (apiSuccess && electricityToken) {
      await adminSupabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
      await adminSupabase.from("transactions").update({ status: "success" }).eq("id", transaction.id);
      await adminSupabase.from("vtu_orders").insert({
        user_id: userId, transaction_id: transaction.id, service_type: "electricity", provider: discoCode,
        recipient: meterNumber, amount: sellingPrice, cost_price: costPrice, profit, status: "success",
        api_response: { token: electricityToken, customerName, meterType, ...(apiResponse as any || {}) },
        provider_used: providerUsed, fallback_attempted: fallbackAttempted, fallback_response: fallbackResponse, fallback_provider: fallbackAttempted ? 'smeplug' : null,
      });

      recordTransactionLedger({ transactionId: transaction.id, userId, sellingPrice, costPrice, profit, balanceBefore: currentBalance, balanceAfter: newBalance, reference, serviceType: 'electricity', provider: providerUsed });
      checkAndRewardFirstTransaction(userId);

      return new Response(JSON.stringify({ success: true, token: electricityToken, message: "Electricity purchased successfully", serviceCharge, totalAmount: sellingPrice }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", transaction.id);
      return new Response(JSON.stringify({ success: false, message: "Electricity purchase failed. Please try again." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", success: false }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
