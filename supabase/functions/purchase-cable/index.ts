import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { checkAndRewardFirstTransaction } from "../_shared/referral-reward.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function comparePin(plaintextPin: string, hashedPin: string): Promise<boolean> {
  if (!hashedPin.startsWith('$2')) return plaintextPin === hashedPin;
  return await bcrypt.compare(plaintextPin, hashedPin);
}

function needsPinMigration(storedPin: string): boolean {
  return !storedPin.startsWith('$2');
}

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

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub;
    const { provider, smartCardNumber, planId, amount, customerName, transactionPin } = await req.json();

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate PIN
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
        const lockUntil = newAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
        await adminSupabase.from("profiles")
          .update({ failed_pin_attempts: newAttempts, pin_locked_until: lockUntil })
          .eq("user_id", userId);
        return new Response(
          JSON.stringify({ error: newAttempts >= 5 ? "Account locked for 30 minutes" : "Invalid transaction PIN", attemptsRemaining: Math.max(0, 5 - newAttempts), success: false }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updates: Record<string, any> = { failed_pin_attempts: 0, pin_locked_until: null };
      if (needsPinMigration(profile.transaction_pin)) {
        const salt = await bcrypt.genSalt(10);
        updates.transaction_pin = await bcrypt.hash(transactionPin, salt);
      }
      if (profile.failed_pin_attempts > 0 || needsPinMigration(profile.transaction_pin)) {
        await adminSupabase.from("profiles").update(updates).eq("user_id", userId);
      }
    }

    const isAgent = profile?.is_agent || false;
    const userType = isAgent ? 'agent' : 'user';

    // Pricing config
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "cable")
      .eq("is_active", true)
      .eq("user_type", userType);

    const config = pricingConfigs?.find(c => c.network === provider.toUpperCase() && c.plan_id === planId)
      || pricingConfigs?.find(c => c.network === provider.toUpperCase() && !c.plan_id)
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

    // Check wallet
    const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", userId).single();
    if (!wallet) throw new Error("Wallet not found");

    const currentBalance = parseFloat(wallet.balance as unknown as string);
    if (currentBalance < sellingPrice) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reference = `CABLE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newBalance = currentBalance - sellingPrice;

    const { data: transaction, error: txError } = await adminSupabase
      .from("transactions")
      .insert({
        user_id: userId, type: "debit", amount: sellingPrice,
        balance_before: currentBalance, balance_after: newBalance,
        status: "pending", reference,
        description: `${provider.toUpperCase()} Subscription - ${smartCardNumber}`,
        metadata: { planId, customerName },
      })
      .select().single();

    if (txError) throw txError;

    // Call SMEPlug API for cable subscription
    const smeplugApiKey = Deno.env.get("SMEPLUG_API_KEY");
    if (!smeplugApiKey) {
      await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", transaction.id);
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable", success: false }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const providerCode = provider.toLowerCase();

    let apiSuccess = false;
    let apiResponse = null;

    try {
      console.log("Calling SMEPlug cable API:", { provider: providerCode, smartCardNumber, planId });

      const response = await fetch("https://smeplug.ng/api/v1/cable/purchase", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${smeplugApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          service_id: providerCode,
          smartcard_number: smartCardNumber,
          plan_id: planId,
          amount: costPrice,
        }),
      });

      apiResponse = await response.json();
      console.log("SMEPlug cable response:", apiResponse);

      apiSuccess = apiResponse?.status === "success" || apiResponse?.success === true;
    } catch (apiError: unknown) {
      console.error("SMEPlug API error:", apiError);
      apiResponse = { error: apiError instanceof Error ? apiError.message : "API error" };
    }

    if (apiSuccess) {
      await adminSupabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
      await adminSupabase.from("transactions").update({ status: "success" }).eq("id", transaction.id);
      await adminSupabase.from("vtu_orders").insert({
        user_id: userId, transaction_id: transaction.id,
        service_type: "cable", provider: providerCode.toUpperCase(),
        recipient: smartCardNumber, amount: sellingPrice,
        cost_price: costPrice, profit, status: "success",
        api_response: { planId, customerName, ...apiResponse },
        provider_used: 'smeplug',
      });
      await adminSupabase.from("notifications").insert({
        user_id: userId,
        title: "Cable Subscription Successful",
        message: `Your ${providerCode.toUpperCase()} subscription for ${smartCardNumber} has been activated.`,
        type: "success",
      });

      return new Response(
        JSON.stringify({ success: true, message: "Subscription successful" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", transaction.id);
      await adminSupabase.from("notifications").insert({
        user_id: userId,
        title: "Cable Subscription Failed",
        message: `Failed to subscribe ${smartCardNumber}. ${apiResponse?.message || "Please try again."}`,
        type: "error",
      });

      return new Response(
        JSON.stringify({ success: false, message: apiResponse?.message || "Subscription failed. Please try again." }),
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
