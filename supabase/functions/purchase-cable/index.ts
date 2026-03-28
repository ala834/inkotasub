import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { subpadiPurchaseCable } from "../_shared/subpadi-provider.ts";
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const userId = user.id;
    const rateCheck = checkRateLimit(userId, "purchase-cable", { maxRequests: 5, windowMs: 60000 });
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { provider, smartCardNumber, planId, amount, customerName, transaction_pin: transactionPin } = await req.json();
    const fraudCheck = await checkFraud(userId, 'cable', amount);
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

    const isAgent = profile?.is_agent || false;
    const userType = isAgent ? 'agent' : 'user';
    const { data: pricingConfigs } = await adminSupabase.from("pricing_config").select("*").eq("service_type", "cable").eq("is_active", true).eq("user_type", userType);
    const config = pricingConfigs?.find(c => c.network === provider.toUpperCase() && c.plan_id === planId) || pricingConfigs?.find(c => c.network === provider.toUpperCase() && !c.plan_id) || pricingConfigs?.find(c => !c.network && !c.plan_id);

    let costPrice = amount;
    const sellingPrice = amount;
    if (config) { costPrice = config.profit_type === 'percentage' ? Math.round(amount / (1 + config.profit_value / 100)) : amount - config.profit_value; }
    const profit = sellingPrice - costPrice;
    if (costPrice >= sellingPrice && config) return jsonResponse({ error: "Service temporarily unavailable.", success: false }, 400);

    const reference = `CABLE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const providerCode = provider.toLowerCase();

    const ctx: TransactionContext = {
      userId, adminSupabase, serviceType: 'cable', sellingPrice, costPrice, profit,
      reference, description: `${provider.toUpperCase()} Subscription - ${smartCardNumber}`,
      provider: providerCode.toUpperCase(), recipient: smartCardNumber,
      metadata: { planId, customerName },
    };

    const lockResult = await acquireLockAndDeductWallet(ctx);
    if (!lockResult.ok) return lockResult.response;

    // Provider call (Subpadi only)
    const result = await withMetrics('subpadi', 'cable',
      () => subpadiPurchaseCable(providerCode, smartCardNumber, planId, costPrice),
      r => r.success
    );

    const providerResult: ProviderResult = {
      success: result.success, message: result.success ? "Subscription successful" : "Subscription failed",
      providerUsed: 'subpadi', fallbackAttempted: false, rawResponse: result.rawResponse,
    };

    return await finalizeTransaction(ctx, lockResult, providerResult);
  } catch (error: unknown) {
    console.error("Error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error", success: false }, 500);
  }
});
