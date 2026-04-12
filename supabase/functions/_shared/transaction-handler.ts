// Hardened VTU Transaction Handler
// Provides: idempotency, safe wallet deduction, retry, state machine (pending→processing→success/failed)

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordTransactionLedger } from "./ledger.ts";
import { checkAndRewardFirstTransaction } from "./referral-reward.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export interface ProviderResult {
  success: boolean;
  message: string;
  providerUsed: string;
  fallbackAttempted: boolean;
  rawResponse: unknown;
  fallbackResponse?: unknown;
  reference?: string;
  token?: string;
  pins?: unknown[];
  extraData?: Record<string, unknown>;
}

export interface TransactionContext {
  userId: string;
  adminSupabase: SupabaseClient;
  serviceType: string;
  sellingPrice: number;
  costPrice: number;
  profit: number;
  reference: string;
  description: string;
  provider: string;
  recipient: string;
  metadata?: Record<string, unknown>;
}

/**
 * Acquires advisory lock and deducts wallet atomically.
 * Returns wallet state or an error response.
 */
export async function acquireLockAndDeductWallet(ctx: TransactionContext): Promise<
  | { ok: true; currentBalance: number; newBalance: number; transactionId: string; lockKey: number }
  | { ok: false; response: Response }
> {
  const { userId, adminSupabase, sellingPrice, reference, description, metadata } = ctx;

  // Idempotency: check if reference already used
  const { data: existingTx } = await adminSupabase
    .from("transactions")
    .select("id, status")
    .eq("reference", reference)
    .maybeSingle();

  if (existingTx) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Duplicate transaction. This request was already processed.", success: false, existingStatus: existingTx.status },
        409
      ),
    };
  }

  // Advisory lock (session-scoped, must be explicitly released)
  const lockKey = hashString(userId);
  const { data: lockAcquired } = await adminSupabase.rpc("try_advisory_lock", {
    lock_key: lockKey,
  });
  if (!lockAcquired) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Another transaction is being processed. Please wait and try again.", success: false },
        409
      ),
    };
  }

  const releaseLock = async () => { try { await adminSupabase.rpc("release_advisory_lock", { lock_key: lockKey }); } catch (_) { /* ignore */ } };

  // Read wallet under lock
  const { data: wallet } = await adminSupabase
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .single();

  if (!wallet) {
    await releaseLock();
    return { ok: false, response: jsonResponse({ error: "Wallet not found", success: false }, 500) };
  }

  const currentBalance = parseFloat(wallet.balance as unknown as string);
  if (currentBalance < sellingPrice) {
    await releaseLock();
    return {
      ok: false,
      response: jsonResponse({ error: "Insufficient balance. Please fund your wallet.", success: false }, 400),
    };
  }

  const newBalance = currentBalance - sellingPrice;

  // Create transaction as PENDING
  const { data: transaction, error: txError } = await adminSupabase
    .from("transactions")
    .insert({
      user_id: userId,
      type: "debit",
      amount: sellingPrice,
      balance_before: currentBalance,
      balance_after: newBalance,
      status: "pending",
      reference,
      description,
      metadata: metadata || null,
    })
    .select()
    .single();

  if (txError) {
    await releaseLock();
    return { ok: false, response: jsonResponse({ error: "Failed to create transaction", success: false }, 500) };
  }

  // Immediately deduct wallet and move to PROCESSING
  await adminSupabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
  await adminSupabase.from("transactions").update({ status: "processing" }).eq("id", transaction.id);

  // Lock is kept held — caller MUST call finalizeTransaction which releases it
  return { ok: true, currentBalance, newBalance, transactionId: transaction.id, lockKey };
}

/**
 * Finalizes transaction after provider response.
 * On success: keeps deduction, records ledger.
 * On failure: refunds wallet, marks transaction failed.
 */
export async function finalizeTransaction(
  ctx: TransactionContext,
  walletState: { currentBalance: number; newBalance: number; transactionId: string; lockKey: number },
  providerResult: ProviderResult
): Promise<Response> {
  const { userId, adminSupabase, serviceType, sellingPrice, costPrice, profit, reference, provider, recipient } = ctx;
  const { currentBalance, newBalance, transactionId, lockKey } = walletState;
  // Helper to release lock
  const releaseLock = async () => { try { await adminSupabase.rpc("release_advisory_lock", { lock_key: lockKey }); } catch (_) { /* ignore */ } };

  try {
    if (providerResult.success) {
      await adminSupabase.from("transactions").update({ status: "success" }).eq("id", transactionId);

      await adminSupabase.from("vtu_orders").insert({
        user_id: userId,
        transaction_id: transactionId,
        service_type: serviceType,
        provider,
        recipient,
        amount: sellingPrice,
        cost_price: costPrice,
        profit,
        status: "success",
        api_response: providerResult.rawResponse,
        provider_used: providerResult.providerUsed,
        fallback_attempted: false,
        fallback_response: null,
        fallback_provider: null,
      });

      // Ledger (fire-and-forget)
      recordTransactionLedger({
        transactionId,
        userId,
        sellingPrice,
        costPrice,
        profit,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        reference,
        serviceType,
        provider: providerResult.providerUsed,
      });

      // Referral reward (fire-and-forget)
      checkAndRewardFirstTransaction(userId);

      const responseBody: Record<string, unknown> = { success: true, message: getSuccessMessage(serviceType) };
      if (providerResult.token) responseBody.token = providerResult.token;
      if (providerResult.pins && providerResult.pins.length > 0) responseBody.pins = providerResult.pins;
      if (providerResult.reference) responseBody.reference = providerResult.reference;
      if (providerResult.extraData) Object.assign(responseBody, providerResult.extraData);

      // Send receipt email (fire-and-forget)
      try {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-receipt-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            userId,
            type: "vtu_purchase",
            amount: sellingPrice,
            reference,
            description: getSuccessMessage(serviceType),
            balanceAfter: newBalance,
            serviceType,
            recipient,
            provider: providerResult.providerUsed,
          }),
        }).catch(e => console.error("Receipt email error:", e));
      } catch (e) {
        console.error("Receipt email fire-and-forget error:", e);
      }

      return jsonResponse(responseBody);
    } else {
      // REFUND wallet - provider failed
      await adminSupabase.from("wallets").update({ balance: currentBalance }).eq("user_id", userId);
      await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", transactionId);

      await adminSupabase.from("vtu_orders").insert({
        user_id: userId,
        transaction_id: transactionId,
        service_type: serviceType,
        provider,
        recipient,
        amount: sellingPrice,
        cost_price: costPrice,
        profit: 0,
        status: "failed",
        api_response: providerResult.rawResponse,
        provider_used: providerResult.providerUsed,
        fallback_attempted: false,
        fallback_response: null,
        fallback_provider: null,
      });

      return jsonResponse({ success: false, message: providerResult.message || "Transaction failed. Please try again." });
    }
  } finally {
    await releaseLock();
  }
}

function getSuccessMessage(serviceType: string): string {
  switch (serviceType) {
    case 'airtime': return 'Airtime purchased successfully';
    case 'data': return 'Data purchased successfully';
    case 'cable': return 'Subscription successful';
    case 'electricity': return 'Electricity purchased successfully';
    case 'exam_pin': return 'Exam card purchased successfully';
    case 'recharge_card': return 'Recharge cards purchased successfully';
    default: return 'Transaction completed successfully';
  }
}

/**
 * Retry wrapper for provider calls.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  isSuccess: (result: T) => boolean,
  maxRetries = 2,
  delayMs = 1500,
): Promise<T> {
  let lastResult: T | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      lastResult = await fn();
      if (isSuccess(lastResult)) return lastResult;
      if (attempt === maxRetries) return lastResult;
    } catch (error) {
      console.error(`Provider attempt ${attempt + 1}/${maxRetries + 1} failed:`, error);
      if (attempt === maxRetries) {
        if (lastResult) return lastResult;
        throw error;
      }
    }
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  return lastResult!;
}
