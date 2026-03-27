import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { subpadiPurchaseElectricity, isSubpadiConfigured } from "../_shared/subpadi-provider.ts";
import { comparePin, needsPinMigration, hashPin } from "../_shared/pin-utils.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { checkFraud, fraudBlockResponse } from "../_shared/fraud-detection.ts";
import { withMetrics } from "../_shared/provider-metrics.ts";
import {
  acquireLockAndDeductWallet,
  finalizeTransaction,
  jsonResponse,
  type TransactionContext,
  type ProviderResult,
} from "../_shared/transaction-handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const userId = user.id;
    const rateCheck = checkRateLimit(userId, "purchase-electricity", { maxRequests: 5, windowMs: 60000 });
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { disco, meterNumber, meterType, amount, customerName, transaction_pin: transactionPin } = await req.json();
    const fraudCheck = await checkFraud(userId, 'electricity', amount);
    if (!fraudCheck.allowed) return fraudBlockResponse(fraudCheck.reason!, corsHeaders);

    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: profile } = await adminSupabase.from("profiles").select("is_agent, transaction_pin, failed_pin_attempts, pin_locked_until").eq("user_id", userId).single();
    if (profile?.pin_locked_until && new Date(profile.pin_locked_until) > new Date()) {
      return jsonResponse({ error: "Account locked due to too many failed PIN attempts.", success: false }, 403);
    }
    if (profile?.transaction_pin) {
      if (!transactionPin) return jsonResponse({ error: "Transaction PIN required", requiresPin: true, success: false }, 400);
      const pinValid = await comparePin(transactionPin, profile.transaction_pin);
      if (!pinValid) {
        const newAttempts = (profile.failed_pin_attempts || 0) + 1;
        const lockUntil = newAttempts >= 3 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
        await adminSupabase.from("profiles").update({ failed_pin_attempts: newAttempts, pin_locked_until: lockUntil }).eq("user_id", userId);
        return jsonResponse({ error: newAttempts >= 3 ? "Account locked for 30 minutes" : "Invalid transaction PIN", attemptsRemaining: Math.max(0, 3 - newAttempts), success: false }, 403);
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
    if (config) { serviceCharge = config.profit_type === 'percentage' ? Math.round(amount * config.profit_value / 100) : config.profit_value; }
    const sellingPrice = amount + serviceCharge;
    const profit = serviceCharge;
    if (costPrice >= sellingPrice && config && serviceCharge <= 0) return jsonResponse({ error: "Service temporarily unavailable.", success: false }, 400);

    const reference = `ELEC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const discoCode = discoMapping[disco.toLowerCase()] || disco.toLowerCase();

    const ctx: TransactionContext = {
      userId, adminSupabase, serviceType: 'electricity', sellingPrice, costPrice, profit,
      reference, description: `Electricity - ${disco.toUpperCase()} - ${meterNumber}`,
      provider: discoCode, recipient: meterNumber,
      metadata: { serviceCharge, unitAmount: amount, meterType, customerName },
    };

    const lockResult = await acquireLockAndDeductWallet(ctx);
    if (!lockResult.ok) return lockResult.response;

    let providerResult: ProviderResult = { success: false, message: "No provider available", providerUsed: 'subpadi', fallbackAttempted: false, rawResponse: null };

    if (isSubpadiConfigured()) {
      const subpadiResult = await withMetrics('subpadi', 'electricity', () => subpadiPurchaseElectricity(discoCode, meterNumber, costPrice, meterType), r => r.success && !!r.token);
      if (subpadiResult.success && subpadiResult.token) {
        providerResult = { success: true, message: "Electricity purchased", providerUsed: 'subpadi', fallbackAttempted: false, rawResponse: subpadiResult.rawResponse, token: subpadiResult.token, extraData: { serviceCharge, totalAmount: sellingPrice } };
      } else {
        const smeplugResult = await withMetrics('smeplug', 'electricity', () => smeplugPurchaseElectricity(discoCode, meterNumber, costPrice, meterType), r => r.success && !!r.token);
        providerResult = {
          success: smeplugResult.success && !!smeplugResult.token, message: smeplugResult.success ? "Electricity purchased" : "Purchase failed",
          providerUsed: smeplugResult.success ? 'smeplug' : 'subpadi', fallbackAttempted: true,
          rawResponse: subpadiResult.rawResponse, fallbackResponse: smeplugResult.rawResponse,
          token: smeplugResult.token, extraData: { serviceCharge, totalAmount: sellingPrice },
        };
      }
    } else {
      const smeplugResult = await withMetrics('smeplug', 'electricity', () => smeplugPurchaseElectricity(discoCode, meterNumber, costPrice, meterType), r => r.success);
      providerResult = { success: smeplugResult.success, message: smeplugResult.success ? "Electricity purchased" : "Purchase failed", providerUsed: 'smeplug', fallbackAttempted: false, rawResponse: smeplugResult.rawResponse, token: smeplugResult.token, extraData: { serviceCharge, totalAmount: sellingPrice } };
    }

    return await finalizeTransaction(ctx, lockResult, providerResult);
  } catch (error: unknown) {
    console.error("Error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error", success: false }, 500);
  }
});
