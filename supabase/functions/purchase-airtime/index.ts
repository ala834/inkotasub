import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { purchaseAirtime, generateReference } from "../_shared/inkota-service-layer.ts";
import { subpadiPurchaseAirtime } from "../_shared/subpadi-provider.ts";
import { executeWithFallback } from "../_shared/provider-fallback.ts";
import { checkAndRewardFirstTransaction } from "../_shared/referral-reward.ts";
import { comparePin, needsPinMigration, hashPin } from "../_shared/pin-utils.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Rate limiting: 5 purchases per minute
    const rateCheck = checkRateLimit(userId, "purchase-airtime", { maxRequests: 5, windowMs: 60000 });
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);
    }

    const { network, phoneNumber, amount, transaction_pin: transactionPin } = await req.json();

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user profile and validate PIN
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("is_agent, transaction_pin, failed_pin_attempts, pin_locked_until")
      .eq("user_id", userId)
      .single();

    if (profile?.pin_locked_until && new Date(profile.pin_locked_until) > new Date()) {
      return new Response(
        JSON.stringify({ error: "Account locked due to too many failed PIN attempts.", success: false }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile?.transaction_pin) {
      if (!transactionPin) {
        return new Response(
          JSON.stringify({ error: "Transaction PIN required", requiresPin: true, success: false }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pinValid = await comparePin(transactionPin, profile.transaction_pin);
      if (!pinValid) {
        const newAttempts = (profile.failed_pin_attempts || 0) + 1;
        const lockUntil = newAttempts >= 3 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
        await adminSupabase.from("profiles")
          .update({ failed_pin_attempts: newAttempts, pin_locked_until: lockUntil })
          .eq("user_id", userId);
        return new Response(
          JSON.stringify({ error: newAttempts >= 3 ? "Account locked for 30 minutes due to too many failed attempts" : "Invalid transaction PIN", attemptsRemaining: Math.max(0, 3 - newAttempts), success: false }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updates: Record<string, any> = { failed_pin_attempts: 0, pin_locked_until: null };
      if (needsPinMigration(profile.transaction_pin)) {
        updates.transaction_pin = await hashPin(transactionPin);
      }
      if (profile.failed_pin_attempts > 0 || needsPinMigration(profile.transaction_pin)) {
        await adminSupabase.from("profiles").update(updates).eq("user_id", userId);
      }
    }

    const isAgent = profile?.is_agent || false;
    const userType = isAgent ? 'agent' : 'user';

    // Get pricing config
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "airtime")
      .eq("is_active", true)
      .eq("user_type", userType);

    const config = pricingConfigs?.find(c => c.network === network.toUpperCase() && !c.plan_id)
      || pricingConfigs?.find(c => !c.network && !c.plan_id);

    let costPrice = amount;
    const sellingPrice = amount;
    if (config) {
      if (config.profit_type === 'percentage') {
        costPrice = Math.round(amount / (1 + config.profit_value / 100));
      } else {
        costPrice = amount - config.profit_value;
      }
    }
    const profit = sellingPrice - costPrice;

    // Acquire advisory lock to prevent concurrent wallet modifications
    const { data: lockAcquired } = await adminSupabase.rpc("try_advisory_lock", {
      lock_key: Math.abs(hashString(userId)),
    });

    if (!lockAcquired) {
      return new Response(
        JSON.stringify({ error: "Another transaction is being processed. Please wait and try again.", success: false }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check wallet balance (use admin client for accuracy after lock)
    const { data: wallet } = await adminSupabase.from("wallets").select("balance").eq("user_id", userId).single();
    if (!wallet) throw new Error("Wallet not found");

    const currentBalance = parseFloat(wallet.balance as unknown as string);
    if (currentBalance < sellingPrice) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance. Please fund your wallet.", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reference = generateReference('airtime');
    const newBalance = currentBalance - sellingPrice;

    // Create pending transaction
    const { data: transaction, error: txError } = await adminSupabase
      .from("transactions")
      .insert({
        user_id: userId, type: "debit", amount: sellingPrice,
        balance_before: currentBalance, balance_after: newBalance,
        status: "pending", reference,
        description: `${network.toUpperCase()} Airtime - ${phoneNumber}`,
      })
      .select().single();

    if (txError) throw txError;

    // Purchase via Subpadi (primary) with SMEPlug fallback
    const result = await executeWithFallback(
      () => subpadiPurchaseAirtime(network, phoneNumber, costPrice),
      () => purchaseAirtime({ network, phoneNumber, amount: costPrice }),
    );

    if (result.success) {
      await adminSupabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
      await adminSupabase.from("transactions").update({ status: "success" }).eq("id", transaction.id);
      await adminSupabase.from("vtu_orders").insert({
        user_id: userId, transaction_id: transaction.id,
        service_type: "airtime", provider: network.toUpperCase(),
        recipient: phoneNumber, amount: sellingPrice,
        cost_price: costPrice, profit, status: "success",
        api_response: result.rawResponse,
        provider_used: result.providerUsed,
        fallback_attempted: result.fallbackAttempted,
        fallback_response: result.fallbackResponse || null,
        fallback_provider: result.fallbackAttempted ? 'smeplug' : null,
      });

      checkAndRewardFirstTransaction(userId);

      return new Response(
        JSON.stringify({ success: true, message: "Airtime purchased successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", transaction.id);
      await adminSupabase.from("vtu_orders").insert({
        user_id: userId, transaction_id: transaction.id,
        service_type: "airtime", provider: network.toUpperCase(),
        recipient: phoneNumber, amount: sellingPrice,
        cost_price: costPrice, profit: 0, status: "failed",
        api_response: result.rawResponse,
        provider_used: result.providerUsed,
        fallback_attempted: result.fallbackAttempted,
        fallback_response: result.fallbackResponse || null,
        fallback_provider: result.fallbackAttempted ? 'smeplug' : null,
      });

      return new Response(
        JSON.stringify({ success: false, message: result.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash;
}
