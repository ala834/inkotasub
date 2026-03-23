import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateReference } from "../_shared/inkota-service-layer.ts";
import { isSubpadiConfigured, getSubpadiNetworkId } from "../_shared/subpadi-provider.ts";
import { checkAndRewardFirstTransaction } from "../_shared/referral-reward.ts";
import { comparePin, needsPinMigration, hashPin } from "../_shared/pin-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RechargeCardPin {
  pin: string;
  serial?: string;
  network: string;
  amount: number;
}

// Subpadi recharge card purchase
async function subpadiPurchaseRechargeCard(
  network: string, amount: number, quantity: number
): Promise<{ success: boolean; message: string; rawResponse: unknown; pins: RechargeCardPin[] }> {
  const token = Deno.env.get("SUBPADI_API_TOKEN");
  if (!token) return { success: false, message: "Service not configured", rawResponse: null, pins: [] };

  const networkId = getSubpadiNetworkId(network);
  if (!networkId) return { success: false, message: "Invalid network", rawResponse: null, pins: [] };

  try {
    const response = await fetch("https://subpadi.com/api/v1/recharge-card/", {
      method: "POST",
      headers: { "Authorization": `Token ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ network_id: networkId, amount, quantity }),
    });
    const data = await response.json();
    console.log("Subpadi Recharge Card Response:", data);
    const success = data?.status === "success" || data?.success === true;
    const pins = extractPins(data, network, amount);
    return { success, message: data?.message || (success ? "Recharge cards generated" : "Purchase failed"), rawResponse: data, pins };
  } catch (error) {
    console.error("Subpadi Recharge Card Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null, pins: [] };
  }
}

// SMEPlug recharge card purchase (fallback)
async function smeplugPurchaseRechargeCard(
  network: string, amount: number, quantity: number
): Promise<{ success: boolean; message: string; rawResponse: unknown; pins: RechargeCardPin[] }> {
  const apiKey = Deno.env.get("SMEPLUG_API_KEY");
  if (!apiKey) return { success: false, message: "Service not configured", rawResponse: null, pins: [] };

  const NETWORK_MAP: Record<string, number> = { 'MTN': 1, 'GLO': 2, 'AIRTEL': 3, '9MOBILE': 4, 'ETISALAT': 4 };
  const networkId = NETWORK_MAP[network.toUpperCase()];
  if (!networkId) return { success: false, message: "Invalid network", rawResponse: null, pins: [] };

  try {
    const response = await fetch("https://smeplug.ng/api/v1/recharge-card/purchase", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ network_id: networkId, amount, quantity }),
    });
    const data = await response.json();
    console.log("SMEPlug Recharge Card Response:", data);
    const success = data?.status === "success" || data?.success === true;
    const pins = extractPins(data, network, amount);
    return { success, message: data?.message || (success ? "Recharge cards generated" : "Purchase failed"), rawResponse: data, pins };
  } catch (error) {
    console.error("SMEPlug Recharge Card Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null, pins: [] };
  }
}

// Extract PIN data from various API response formats
function extractPins(data: any, network: string, amount: number): RechargeCardPin[] {
  const pins: RechargeCardPin[] = [];
  const rawPins = data?.data?.pins || data?.data?.cards || data?.pins || data?.cards || [];
  const pinArray = Array.isArray(rawPins) ? rawPins : [rawPins];

  for (const item of pinArray) {
    if (typeof item === 'string') {
      pins.push({ pin: item, network: network.toUpperCase(), amount });
    } else if (item?.pin) {
      pins.push({ pin: item.pin, serial: item.serial || item.serial_number, network: network.toUpperCase(), amount });
    } else if (item?.token) {
      pins.push({ pin: item.token, serial: item.serial, network: network.toUpperCase(), amount });
    }
  }

  // Single pin format
  if (pins.length === 0) {
    const singlePin = data?.data?.pin || data?.pin || data?.data?.token || data?.token;
    if (singlePin) {
      pins.push({ pin: singlePin, serial: data?.data?.serial || data?.serial, network: network.toUpperCase(), amount });
    }
  }

  return pins;
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const { network, amount, quantity = 1, transaction_pin: transactionPin } = await req.json();

    if (!network || !amount || quantity < 1 || quantity > 20) {
      return new Response(
        JSON.stringify({ error: "Invalid request. Network, amount, and quantity (1-20) are required.", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
          JSON.stringify({ error: newAttempts >= 3 ? "Account locked for 30 minutes" : "Invalid transaction PIN", attemptsRemaining: Math.max(0, 3 - newAttempts), success: false }),
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

    // Get pricing config for recharge_card
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "recharge_card")
      .eq("is_active", true)
      .eq("user_type", userType);

    const config = pricingConfigs?.find(c => c.network === network.toUpperCase() && !c.plan_id)
      || pricingConfigs?.find(c => !c.network && !c.plan_id);

    const perCardAmount = amount;
    const totalAmount = perCardAmount * quantity;
    let costPricePerCard = perCardAmount;

    if (config) {
      if (config.profit_type === 'percentage') {
        costPricePerCard = Math.round(perCardAmount / (1 + config.profit_value / 100));
      } else {
        costPricePerCard = perCardAmount - config.profit_value;
      }
    }

    const totalCostPrice = costPricePerCard * quantity;
    const totalProfit = totalAmount - totalCostPrice;

    // Check wallet balance
    const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", userId).single();
    if (!wallet) throw new Error("Wallet not found");

    const currentBalance = parseFloat(wallet.balance as unknown as string);
    if (currentBalance < totalAmount) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance. Please fund your wallet.", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reference = generateReference('recharge_card');
    const newBalance = currentBalance - totalAmount;

    // Create pending transaction
    const { data: transaction, error: txError } = await adminSupabase
      .from("transactions")
      .insert({
        user_id: userId, type: "debit", amount: totalAmount,
        balance_before: currentBalance, balance_after: newBalance,
        status: "pending", reference,
        description: `${network.toUpperCase()} Recharge Card ₦${perCardAmount} x${quantity}`,
      })
      .select().single();

    if (txError) throw txError;

    // Purchase via providers with fallback
    let apiSuccess = false;
    let providerUsed = 'subpadi';
    let fallbackAttempted = false;
    let apiResponse: unknown = null;
    let fallbackResponse: unknown = null;
    let resultPins: RechargeCardPin[] = [];

    if (isSubpadiConfigured()) {
      const subpadiResult = await subpadiPurchaseRechargeCard(network, costPricePerCard, quantity);
      apiResponse = subpadiResult.rawResponse;
      if (subpadiResult.success && subpadiResult.pins.length > 0) {
        apiSuccess = true;
        resultPins = subpadiResult.pins;
      } else {
        console.log("Subpadi recharge card failed, trying SMEPlug fallback:", subpadiResult.message);
        fallbackAttempted = true;
        const smeplugResult = await smeplugPurchaseRechargeCard(network, costPricePerCard, quantity);
        fallbackResponse = smeplugResult.rawResponse;
        if (smeplugResult.success && smeplugResult.pins.length > 0) {
          apiSuccess = true;
          providerUsed = 'smeplug';
          resultPins = smeplugResult.pins;
        }
      }
    } else {
      const smeplugResult = await smeplugPurchaseRechargeCard(network, costPricePerCard, quantity);
      apiResponse = smeplugResult.rawResponse;
      providerUsed = 'smeplug';
      apiSuccess = smeplugResult.success;
      resultPins = smeplugResult.pins;
    }

    if (apiSuccess) {
      await adminSupabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
      await adminSupabase.from("transactions").update({
        status: "success",
        metadata: {
          service: "recharge_card",
          network: network.toUpperCase(),
          card_amount: perCardAmount,
          quantity,
          pins: resultPins,
          provider_used: providerUsed,
        },
      }).eq("id", transaction.id);
      await adminSupabase.from("vtu_orders").insert({
        user_id: userId, transaction_id: transaction.id,
        service_type: "recharge_card", provider: network.toUpperCase(),
        recipient: `${network.toUpperCase()} ₦${perCardAmount} x${quantity}`,
        amount: totalAmount, cost_price: totalCostPrice, profit: totalProfit,
        status: "success", api_response: apiResponse,
        provider_used: providerUsed, fallback_attempted: fallbackAttempted,
        fallback_response: fallbackResponse || null,
        fallback_provider: fallbackAttempted ? 'smeplug' : null,
      });

      checkAndRewardFirstTransaction(userId);

      return new Response(
        JSON.stringify({ success: true, message: "Recharge cards purchased successfully", pins: resultPins, reference }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", transaction.id);
      await adminSupabase.from("vtu_orders").insert({
        user_id: userId, transaction_id: transaction.id,
        service_type: "recharge_card", provider: network.toUpperCase(),
        recipient: `${network.toUpperCase()} ₦${perCardAmount} x${quantity}`,
        amount: totalAmount, cost_price: totalCostPrice, profit: 0,
        status: "failed", api_response: apiResponse,
        provider_used: providerUsed, fallback_attempted: fallbackAttempted,
        fallback_response: fallbackResponse || null,
        fallback_provider: fallbackAttempted ? 'smeplug' : null,
      });

      return new Response(
        JSON.stringify({ success: false, message: "Recharge card purchase failed. Please try again." }),
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
