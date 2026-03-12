import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { generateReference, normalizeResponse, type NormalizedTransactionResponse } from "../_shared/inkota-service-layer.ts";
import { subpadiPurchaseExamPin, isSubpadiConfigured } from "../_shared/subpadi-provider.ts";
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

// SMEPlug exam PIN purchase (fallback)
async function smeplugPurchaseExamPin(examType: string, quantity: number): Promise<NormalizedTransactionResponse> {
  const apiKey = Deno.env.get("SMEPLUG_API_KEY");
  if (!apiKey) return normalizeResponse(false, "Service not configured", null);

  try {
    const response = await fetch("https://smeplug.ng/api/v1/education/purchase", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ exam_type: examType, quantity }),
    });
    const data = await response.json();
    console.log("SMEPlug Exam PIN Response:", data);
    const success = data?.status === "success" || data?.success === true;
    return normalizeResponse(success, data?.message || (success ? "Exam card purchased" : "Purchase failed"), data, { reference: data?.reference || data?.data?.reference });
  } catch (error) {
    console.error("SMEPlug Exam PIN Error:", error);
    return normalizeResponse(false, error instanceof Error ? error.message : "API error", null);
  }
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
    const { examType, quantity = 1, amount, transaction_pin: transactionPin } = await req.json();

    if (!examType || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "exam_pin")
      .eq("is_active", true)
      .eq("user_type", userType);

    const config = pricingConfigs?.find(c => c.plan_id === examType)
      || pricingConfigs?.find(c => !c.plan_id);

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

    const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", userId).single();
    if (!wallet) throw new Error("Wallet not found");

    const currentBalance = parseFloat(wallet.balance as unknown as string);
    if (currentBalance < sellingPrice) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance. Please fund your wallet.", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reference = generateReference('exam_pin');
    const newBalance = currentBalance - sellingPrice;

    const { data: transaction, error: txError } = await adminSupabase
      .from("transactions")
      .insert({
        user_id: userId, type: "debit", amount: sellingPrice,
        balance_before: currentBalance, balance_after: newBalance,
        status: "pending", reference,
        description: `${examType.toUpperCase()} Exam PIN x${quantity}`,
      })
      .select().single();

    if (txError) throw txError;

    // Try Subpadi first, then SMEPlug fallback
    let apiSuccess = false;
    let providerUsed = 'subpadi';
    let fallbackAttempted = false;
    let apiResponse: unknown = null;
    let fallbackResponse: unknown = null;

    if (isSubpadiConfigured()) {
      const subpadiResult = await subpadiPurchaseExamPin(examType, quantity);
      apiResponse = subpadiResult.rawResponse;
      if (subpadiResult.success) {
        apiSuccess = true;
      } else {
        console.log("Subpadi exam failed, trying SMEPlug fallback:", subpadiResult.message);
        fallbackAttempted = true;
        const smeplugResult = await smeplugPurchaseExamPin(examType, quantity);
        fallbackResponse = smeplugResult._internal.rawResponse;
        if (smeplugResult.success) {
          apiSuccess = true;
          providerUsed = 'smeplug';
        }
      }
    } else {
      const smeplugResult = await smeplugPurchaseExamPin(examType, quantity);
      apiResponse = smeplugResult._internal.rawResponse;
      providerUsed = 'smeplug';
      apiSuccess = smeplugResult.success;
    }

    if (apiSuccess) {
      await adminSupabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
      await adminSupabase.from("transactions").update({ status: "success" }).eq("id", transaction.id);
      await adminSupabase.from("vtu_orders").insert({
        user_id: userId, transaction_id: transaction.id,
        service_type: "exam_pin", provider: examType.toUpperCase(),
        recipient: `${examType.toUpperCase()} x${quantity}`,
        amount: sellingPrice, cost_price: costPrice, profit,
        status: "success", api_response: apiResponse,
        provider_used: providerUsed, fallback_attempted: fallbackAttempted,
        fallback_response: fallbackResponse, fallback_provider: fallbackAttempted ? 'smeplug' : null,
      });

      checkAndRewardFirstTransaction(userId);

      return new Response(
        JSON.stringify({ success: true, message: "Exam card purchased successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", transaction.id);
      await adminSupabase.from("vtu_orders").insert({
        user_id: userId, transaction_id: transaction.id,
        service_type: "exam_pin", provider: examType.toUpperCase(),
        recipient: `${examType.toUpperCase()} x${quantity}`,
        amount: sellingPrice, cost_price: costPrice, profit: 0,
        status: "failed", api_response: apiResponse,
        provider_used: providerUsed, fallback_attempted: fallbackAttempted,
        fallback_response: fallbackResponse, fallback_provider: fallbackAttempted ? 'smeplug' : null,
      });

      return new Response(
        JSON.stringify({ success: false, message: "Exam card purchase failed. Please try again." }),
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
