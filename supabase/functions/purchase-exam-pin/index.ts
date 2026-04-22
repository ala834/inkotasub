import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateReference } from "../_shared/inkota-service-layer.ts";
import { subpadiPurchaseExamPin } from "../_shared/subpadi-provider.ts";
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

function extractPins(data: any): string[] {
  const pins: string[] = [];
  if (data?.data?.pins) pins.push(...(Array.isArray(data.data.pins) ? data.data.pins : [data.data.pins]));
  else if (data?.data?.pin) pins.push(data.data.pin);
  else if (data?.data?.cards) {
    const cards = Array.isArray(data.data.cards) ? data.data.cards : [data.data.cards];
    cards.forEach((c: any) => { if (typeof c === 'string') pins.push(c); else if (c?.pin && c?.serial) pins.push(`PIN: ${c.pin} | Serial: ${c.serial}`); else if (c?.pin) pins.push(c.pin); });
  } else if (data?.pins) pins.push(...(Array.isArray(data.pins) ? data.pins : [data.pins]));
  else if (data?.pin) pins.push(data.pin);
  else if (data?.token) pins.push(data.token);
  return pins;
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
    const rateCheck = checkRateLimit(userId, "purchase-exam", { maxRequests: 5, windowMs: 60000 });
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { examType, quantity = 1, amount, transaction_pin: transactionPin } = await req.json();
    if (!examType || !amount) return jsonResponse({ error: "Missing required fields", success: false }, 400);

    const fraudCheck = await checkFraud(userId, 'exam_pin', amount);
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
    const { data: pricingConfigs } = await adminSupabase.from("pricing_config").select("*").eq("service_type", "exam_pin").eq("is_active", true).eq("user_type", userType);
    const config = pricingConfigs?.find(c => c.plan_id === examType) || pricingConfigs?.find(c => !c.plan_id);

    const sellingPrice = amount;
    let costPrice = amount;
    if (config) {
      costPrice = config.profit_type === 'percentage'
        ? Math.round(amount * (1 - config.profit_value / 100))
        : amount - config.profit_value;
    }
    const profit = sellingPrice - costPrice;
    if (profit < 0) return jsonResponse({ error: "Service temporarily unavailable.", success: false }, 400);

    const reference = generateReference('exam_pin');

    const ctx: TransactionContext = {
      userId, adminSupabase, serviceType: 'exam_pin', sellingPrice, costPrice, profit,
      reference, description: `${examType.toUpperCase()} Exam PIN x${quantity}`,
      provider: examType.toUpperCase(), recipient: `${examType.toUpperCase()} x${quantity}`,
    };

    const lockResult = await acquireLockAndDeductWallet(ctx);
    if (!lockResult.ok) return lockResult.response;

    // Provider call (Subpadi only)
    const result = await withMetrics('subpadi', 'exam_pin',
      () => subpadiPurchaseExamPin(examType, quantity),
      r => r.success
    );

    const pins = extractPins(result.rawResponse);
    const indeterminate = !result.success && /timeout|aborted|network|fetch failed|after retries|503|504/i.test(result.message || "");
    const providerResult: ProviderResult = {
      success: result.success, indeterminate,
      message: result.success ? "Exam card purchased" : (indeterminate ? "Processing... Your transaction is being confirmed." : (result.message || "Purchase failed")),
      providerUsed: 'subpadi', fallbackAttempted: false, rawResponse: result.rawResponse,
      pins: result.success ? pins : undefined, extraData: { reference },
    };

    return await finalizeTransaction(ctx, lockResult, providerResult);
  } catch (error: unknown) {
    console.error("Error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error", success: false }, 500);
  }
});
