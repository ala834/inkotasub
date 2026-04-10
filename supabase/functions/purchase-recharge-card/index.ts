import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateReference } from "../_shared/inkota-service-layer.ts";
import { getSubpadiNetworkId } from "../_shared/subpadi-provider.ts";
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

interface RechargeCardPin { pin: string; serial?: string; network: string; amount: number; }

interface RechargeCardRequestAttempt {
  label: string;
  url: string;
  body: Record<string, unknown>;
}

const RECHARGE_CARD_TIMEOUT_MS = 15000;
const RECHARGE_CARD_MAX_RETRIES = 2;

function buildRechargeCardAttempts(networkId: number, amount: number, quantity: number): RechargeCardRequestAttempt[] {
  return [
    {
      label: "pin-network-quantity",
      url: "https://subpadi.com/api/pin/",
      body: { network: networkId, amount, quantity },
    },
    {
      label: "pin-network_id-quantity",
      url: "https://subpadi.com/api/pin/",
      body: { network_id: networkId, amount, quantity },
    },
    {
      label: "pin-network-qty",
      url: "https://subpadi.com/api/pin/",
      body: { network: networkId, amount, qty: quantity },
    },
    {
      label: "pin-network_id-qty",
      url: "https://subpadi.com/api/pin/",
      body: { network_id: networkId, amount, qty: quantity },
    },
    {
      label: "pin-network-number_of_pins",
      url: "https://subpadi.com/api/pin/",
      body: { network: networkId, amount, number_of_pins: quantity },
    },
  ];
}

function extractRechargeCardErrorMessage(data: any, responseStatus: number, responseText: string) {
  if (data && typeof data === "object") {
    const directMessage = data?.error || data?.message || data?.msg || data?.detail;
    if (typeof directMessage === "string" && directMessage.trim()) return directMessage;
    if (Array.isArray(data?.error) && data.error.length > 0) return data.error.join("; ");

    const fieldErrors = Object.entries(data)
      .filter(([key, value]) => {
        if (["success", "status", "Status", "message", "msg", "detail", "error", "reference", "data", "id"].includes(key)) {
          return false;
        }
        return Array.isArray(value) && value.length > 0 && typeof value[0] === "string";
      })
      .map(([key, value]) => `${key}: ${(value as string[]).join("; ")}`);

    if (fieldErrors.length > 0) return fieldErrors.join(". ");
  }

  if (responseStatus === 404) return "Recharge card provider endpoint was not found.";
  if (responseText?.includes("<!doctype html")) return `Provider returned HTTP ${responseStatus}.`;
  return "Recharge card service is not available at the moment";
}

async function subpadiPurchaseRechargeCard(network: string, amount: number, quantity: number) {
  const token = Deno.env.get("SUBPADI_API_TOKEN");
  if (!token) return { success: false, message: "Service not configured", rawResponse: null, pins: [] as RechargeCardPin[] };
  const networkId = getSubpadiNetworkId(network);
  if (!networkId) return { success: false, message: "Invalid network", rawResponse: null, pins: [] as RechargeCardPin[] };

  const attempts = buildRechargeCardAttempts(networkId, amount, quantity);
  let lastFailure = {
    success: false,
    message: "Recharge card service is not available at the moment",
    rawResponse: null as unknown,
    pins: [] as RechargeCardPin[],
  };

  try {
    for (let ai = 0; ai < attempts.length; ai++) {
      const requestAttempt = attempts[ai];
      // Add delay between different endpoint variants to avoid throttling
      if (ai > 0) await new Promise((resolve) => setTimeout(resolve, 1500));

      for (let retry = 0; retry <= RECHARGE_CARD_MAX_RETRIES; retry++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), RECHARGE_CARD_TIMEOUT_MS);

        try {
          console.log(`Subpadi Recharge Card Request [${requestAttempt.label}] (retry ${retry + 1}/${RECHARGE_CARD_MAX_RETRIES + 1}):`, JSON.stringify(requestAttempt.body));
          const response = await fetch(requestAttempt.url, {
            method: "POST",
            headers: { "Authorization": `Token ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(requestAttempt.body),
            signal: controller.signal,
          });

          const responseText = await response.text();
          console.log(`Subpadi Recharge Card Response Status [${requestAttempt.label}]:`, response.status);
          console.log(`Subpadi Recharge Card Response Body [${requestAttempt.label}]:`, responseText);

          let data: any;
          try {
            data = JSON.parse(responseText);
          } catch {
            data = { raw: responseText.substring(0, 500) };
          }

          // Handle 429 throttling with exponential backoff and retry
          if (response.status === 429) {
            console.warn(`Subpadi throttled [${requestAttempt.label}], waiting before retry...`);
            const backoffMs = 2000 * (retry + 1);
            if (retry < RECHARGE_CARD_MAX_RETRIES) {
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
              continue; // retry same variant
            }
            lastFailure = { success: false, message: "Service is busy. Please try again in a moment.", rawResponse: data, pins: [] as RechargeCardPin[] };
            break; // move to next variant
          }

          const pins = extractPins(data, network, amount);
          const success = (data?.status === "success" || data?.success === true || response.ok) && pins.length > 0;
          if (success) {
            clearTimeout(timeoutId);
            return {
              success: true,
              message: data?.message || "Recharge cards generated",
              rawResponse: data,
              pins,
            };
          }

          const errorMessage = extractRechargeCardErrorMessage(data, response.status, responseText);
          console.error(`Subpadi Recharge Card Error [${requestAttempt.label}]:`, errorMessage);
          lastFailure = {
            success: false,
            message: pins.length === 0 && response.ok ? "Provider did not return recharge card PINs." : errorMessage,
            rawResponse: data,
            pins: [] as RechargeCardPin[],
          };

          clearTimeout(timeoutId);

          // 405 = wrong endpoint variant, skip retries and try next variant immediately
          if (response.status === 405) break;
          if (response.status < 500) break;
          if (retry < RECHARGE_CARD_MAX_RETRIES) await new Promise((resolve) => setTimeout(resolve, 1000 * (retry + 1)));
        } catch (error) {
          clearTimeout(timeoutId);
          console.error(`Subpadi Recharge Card Exception [${requestAttempt.label}]:`, error);
          lastFailure = {
            success: false,
            message: error instanceof Error ? error.message : "API error",
            rawResponse: null,
            pins: [] as RechargeCardPin[],
          };

          if (retry < RECHARGE_CARD_MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * (retry + 1)));
            continue;
          }
        }
      }
    }

    return lastFailure;
  } catch (error) {
    console.error("Subpadi Recharge Card Exception:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null, pins: [] as RechargeCardPin[] };
  }
}

function extractPins(data: any, network: string, amount: number): RechargeCardPin[] {
  const pins: RechargeCardPin[] = [];
  const rawPins = data?.data?.pins
    || data?.data?.cards
    || data?.data?.recharge_cards
    || data?.data?.vouchers
    || (Array.isArray(data?.data) ? data.data : null)
    || data?.pins
    || data?.cards
    || data?.recharge_cards
    || data?.vouchers
    || [];
  const pinArray = Array.isArray(rawPins) ? rawPins : [rawPins];
  for (const item of pinArray) {
    if (typeof item === 'string') pins.push({ pin: item, network: network.toUpperCase(), amount });
    else if (item?.pin) pins.push({ pin: item.pin, serial: item.serial || item.serial_number, network: network.toUpperCase(), amount });
    else if (item?.voucher_pin) pins.push({ pin: item.voucher_pin, serial: item.serial || item.serial_number, network: network.toUpperCase(), amount });
    else if (item?.pin_number) pins.push({ pin: item.pin_number, serial: item.serial || item.serial_number, network: network.toUpperCase(), amount });
    else if (item?.token) pins.push({ pin: item.token, serial: item.serial, network: network.toUpperCase(), amount });
  }
  if (pins.length === 0) {
    const singlePin = data?.data?.pin || data?.pin || data?.data?.voucher_pin || data?.voucher_pin || data?.data?.pin_number || data?.pin_number || data?.data?.token || data?.token;
    if (singlePin) pins.push({ pin: singlePin, serial: data?.data?.serial || data?.serial, network: network.toUpperCase(), amount });
  }
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
    const rateCheck = checkRateLimit(userId, "purchase-recharge", { maxRequests: 5, windowMs: 60000 });
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { network, amount, quantity = 1, transaction_pin: transactionPin } = await req.json();
    if (!network || !amount || quantity < 1 || quantity > 20) return jsonResponse({ error: "Invalid request.", success: false }, 400);

    const fraudCheck = await checkFraud(userId, 'recharge_card', amount * quantity);
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
    const { data: pricingConfigs } = await adminSupabase.from("pricing_config").select("*").eq("service_type", "recharge_card").eq("is_active", true).eq("user_type", userType);
    const config = pricingConfigs?.find(c => c.network === network.toUpperCase() && !c.plan_id) || pricingConfigs?.find(c => !c.network && !c.plan_id);

    const perCardAmount = amount;
    const totalAmount = perCardAmount * quantity;
    let costPricePerCard = perCardAmount;
    if (config) { costPricePerCard = config.profit_type === 'percentage' ? Math.round(perCardAmount / (1 + config.profit_value / 100)) : perCardAmount - config.profit_value; }
    const totalCostPrice = costPricePerCard * quantity;
    const totalProfit = totalAmount - totalCostPrice;

    const reference = generateReference('recharge_card');

    const ctx: TransactionContext = {
      userId, adminSupabase, serviceType: 'recharge_card', sellingPrice: totalAmount, costPrice: totalCostPrice, profit: totalProfit,
      reference, description: `${network.toUpperCase()} Recharge Card ₦${perCardAmount} x${quantity}`,
      provider: network.toUpperCase(), recipient: `${network.toUpperCase()} ₦${perCardAmount} x${quantity}`,
      metadata: { service: "recharge_card", network: network.toUpperCase(), card_amount: perCardAmount, quantity },
    };

    const lockResult = await acquireLockAndDeductWallet(ctx);
    if (!lockResult.ok) return lockResult.response;

    // Provider call (Subpadi only)
    const result = await withMetrics('subpadi', 'recharge_card',
      () => subpadiPurchaseRechargeCard(network, costPricePerCard, quantity),
      r => r.success && r.pins.length > 0
    );

    const providerResult: ProviderResult = {
      success: result.success && result.pins.length > 0,
      message: result.success ? "Recharge cards purchased" : (result.message || "Purchase failed"),
      providerUsed: 'subpadi', fallbackAttempted: false, rawResponse: result.rawResponse,
      pins: result.pins, extraData: { reference },
    };

    return await finalizeTransaction(ctx, lockResult, providerResult);
  } catch (error: unknown) {
    console.error("Error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error", success: false }, 500);
  }
});
