import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateReference } from "../_shared/inkota-service-layer.ts";
import { subpadiPurchaseAirtime } from "../_shared/subpadi-provider.ts";
import { smeplugPurchaseAirtime } from "../_shared/smeplug-provider.ts";
import { clubkonnectPurchaseAirtime } from "../_shared/clubkonnect-provider.ts";
import { renderPurchaseAirtime } from "../_shared/render-provider.ts";
import { normalizePhone, detectNetwork } from "../_shared/phone-utils.ts";
import { comparePin, needsPinMigration, hashPin } from "../_shared/pin-utils.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { checkFraud, fraudBlockResponse } from "../_shared/fraud-detection.ts";
import { executeWithFallback } from "../_shared/provider-fallback.ts";
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const userId = user.id;
    const rateCheck = checkRateLimit(userId, "purchase-airtime", { maxRequests: 5, windowMs: 60000 });
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { network, phoneNumber, amount, transaction_pin: transactionPin } = await req.json();
    console.log("Purchase airtime request - network:", network, "phoneNumber:", phoneNumber, "amount:", amount);

    // ─── Normalize phone (always to local 0XXXXXXXXXX) ───
    const phone = normalizePhone(phoneNumber);
    if (!phone) {
      console.error(`[purchase-airtime] INVALID INPUT: phone=${phoneNumber}`);
      return jsonResponse({ error: `Invalid phone number: ${phoneNumber}`, success: false }, 400);
    }
    const normalizedPhone = phone.local;

    const validNetworks = ['mtn', 'glo', 'airtel', '9mobile', 'etisalat'];
    let resolvedNetwork = network?.toLowerCase?.() || '';

    if (!validNetworks.includes(resolvedNetwork)) {
      const detected = detectNetwork(normalizedPhone);
      if (detected) resolvedNetwork = detected;
      if (!validNetworks.includes(resolvedNetwork)) {
        return jsonResponse({ error: `Could not detect network for ${phoneNumber}`, success: false }, 400);
      }
      console.log(`Auto-detected network: ${resolvedNetwork} from phone: ${normalizedPhone}`);
    }
    
    const fraudCheck = await checkFraud(userId, 'airtime', amount);
    if (!fraudCheck.allowed) return fraudBlockResponse(fraudCheck.reason!, corsHeaders);

    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // PIN validation
    const { data: profile } = await adminSupabase.from("profiles").select("is_agent, transaction_pin, failed_pin_attempts, pin_locked_until").eq("user_id", userId).single();
    if (profile?.pin_locked_until && new Date(profile.pin_locked_until) > new Date()) {
      return jsonResponse({ error: "Account locked due to too many failed PIN attempts. Try again in 30 minutes.", success: false }, 403);
    }
    if (profile?.transaction_pin) {
      if (!transactionPin) return jsonResponse({ error: "Transaction PIN required", requiresPin: true, success: false }, 400);
      const pinValid = await comparePin(transactionPin, profile.transaction_pin);
      if (!pinValid) {
        const newAttempts = (profile.failed_pin_attempts || 0) + 1;
        const lockUntil = newAttempts >= 3 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
        await adminSupabase.from("profiles").update({ failed_pin_attempts: newAttempts, pin_locked_until: lockUntil }).eq("user_id", userId);
        return jsonResponse({ error: newAttempts >= 3 ? "Account locked for 30 minutes due to too many failed attempts." : "Incorrect PIN", attemptsRemaining: Math.max(0, 3 - newAttempts), success: false }, 403);
      }
      const updates: Record<string, any> = { failed_pin_attempts: 0, pin_locked_until: null };
      if (needsPinMigration(profile.transaction_pin)) updates.transaction_pin = await hashPin(transactionPin);
      if (profile.failed_pin_attempts > 0 || needsPinMigration(profile.transaction_pin)) await adminSupabase.from("profiles").update(updates).eq("user_id", userId);
    }

    // Pricing
    const isAgent = profile?.is_agent || false;
    const userType = isAgent ? 'agent' : 'user';
    const { data: pricingConfigs } = await adminSupabase.from("pricing_config").select("*").eq("service_type", "airtime").eq("is_active", true).eq("user_type", userType);
    const config = pricingConfigs?.find(c => c.network === resolvedNetwork.toUpperCase() && !c.plan_id) || pricingConfigs?.find(c => !c.network && !c.plan_id);

    const sellingPrice = amount;
    let costPrice = amount;
    if (config) {
      // costPrice = what we pay the provider (discounted), sellingPrice = what user pays (full amount)
      costPrice = config.profit_type === 'percentage'
        ? Math.round(amount * (1 - config.profit_value / 100))
        : amount - config.profit_value;
    }
    const profit = sellingPrice - costPrice;
    if (profit < 0) return jsonResponse({ error: "Service temporarily unavailable.", success: false }, 400);

    const reference = generateReference('airtime');
    const ctx: TransactionContext = {
      userId, adminSupabase, serviceType: 'airtime', sellingPrice, costPrice, profit,
      reference, description: `${resolvedNetwork.toUpperCase()} Airtime - ${normalizedPhone}`,
      provider: resolvedNetwork.toUpperCase(), recipient: normalizedPhone,
    };

    const lockResult = await acquireLockAndDeductWallet(ctx);
    if (!lockResult.ok) return lockResult.response;

    // 9mobile is fragile on some providers — prefer Subpadi/SMEPlug routing
    const preferredProvider = resolvedNetwork === '9mobile' ? 'subpadi' : undefined;

    // Provider call — always send FULL amount so user gets the full value
    const result = await executeWithFallback(
      () => subpadiPurchaseAirtime(resolvedNetwork, normalizedPhone, sellingPrice),
      () => smeplugPurchaseAirtime(resolvedNetwork, normalizedPhone, sellingPrice),
      'airtime',
      resolvedNetwork,
      preferredProvider ? { preferredProvider } : { preferredProvider: 'smeplug' },
      () => clubkonnectPurchaseAirtime(resolvedNetwork, normalizedPhone, sellingPrice),
      () => renderPurchaseAirtime(resolvedNetwork, normalizedPhone, sellingPrice),
    );

    // User-friendly message — distinguish indeterminate (timeout) vs definitive failure
    let userMessage = result.message;
    if (!result.success) {
      if (result.indeterminate) {
        console.warn(`[purchase-airtime] INDETERMINATE for ${resolvedNetwork} ${normalizedPhone}: ${result.message}`);
        userMessage = "Processing... Your transaction is being confirmed.";
      } else {
        console.error(`[purchase-airtime] All providers failed for ${resolvedNetwork} ${normalizedPhone}: ${result.message}`);
        userMessage = "Service temporarily unavailable, please try again.";
      }
    }

    const providerResult: ProviderResult = {
      success: result.success, indeterminate: result.indeterminate, message: userMessage,
      providerUsed: result.providerUsed, fallbackAttempted: result.fallbackAttempted,
      rawResponse: result.rawResponse, reference: result.reference,
    };

    return await finalizeTransaction(ctx, lockResult, providerResult);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const isAbort = error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message));
    console.error(`[purchase-airtime] ${isAbort ? "TIMEOUT" : "ERROR"}:`, msg);
    return jsonResponse({ error: "Service temporarily unavailable, please try again.", success: false }, 500);
  }
});
