import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Heuristic — treat any of these substrings in provider_message/api_response as failure
const FAILURE_KEYWORDS = [
  "abort", "aborted", "not available", "unavailable", "error", "fail", "failed",
  "insufficient", "invalid", "declined", "rejected", "timeout", "timed out",
  "could not", "unable", "exception", "no response", "network error",
];

const SUCCESS_KEYWORDS = ["success", "successful", "delivered", "completed", "approved"];

function looksSuccessful(value: unknown): boolean {
  if (!value) return false;
  const v = value as any;
  const status = String(v?.status ?? v?.Status ?? v?.current_status ?? "").toLowerCase();
  if (status === "success" || status === "successful" || status === "delivered" || status === "completed") return true;
  if (v?.success === true) return true;
  const blob = JSON.stringify(v).toLowerCase();
  return SUCCESS_KEYWORDS.some((k) => blob.includes(k)) && !FAILURE_KEYWORDS.some((k) => blob.includes(k));
}

function looksFailed(message: string | null | undefined, apiResponse: unknown): boolean {
  const msg = String(message ?? "").toLowerCase();
  if (msg && FAILURE_KEYWORDS.some((k) => msg.includes(k))) return true;
  if (apiResponse) {
    const blob = JSON.stringify(apiResponse).toLowerCase();
    if (FAILURE_KEYWORDS.some((k) => blob.includes(k))) return true;
  }
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Require authentication: service_role JWT or authenticated admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData } = await adminSupabase.auth.getClaims(token);
    const claims = claimsData?.claims as any;
    const isServiceRole = claims?.role === "service_role";
    let authorized = isServiceRole;
    if (!authorized && claims?.sub) {
      const { data: role } = await adminSupabase
        .from("user_roles")
        .select("role")
        .eq("user_id", claims.sub)
        .eq("role", "admin")
        .maybeSingle();
      authorized = !!role;
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional body: { transaction_id?: string, max_age_minutes?: number }
    let body: any = {};
    try { body = req.method === "POST" ? await req.json() : {}; } catch { /* ignore */ }
    const singleTxId: string | undefined = body?.transaction_id;
    const minAgeMinutes = typeof body?.min_age_minutes === "number" ? body.min_age_minutes : 2;
    const forceFailAfterMinutes = typeof body?.force_fail_after_minutes === "number" ? body.force_fail_after_minutes : 30;

    const minAgeCutoff = new Date(Date.now() - minAgeMinutes * 60 * 1000).toISOString();
    const forceFailCutoff = new Date(Date.now() - forceFailAfterMinutes * 60 * 1000).toISOString();

    let query = adminSupabase
      .from("transactions")
      .select("id, user_id, amount, balance_before, balance_after, reference, created_at, status, type")
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: true })
      .limit(200);

    if (singleTxId) {
      query = adminSupabase
        .from("transactions")
        .select("id, user_id, amount, balance_before, balance_after, reference, created_at, status, type")
        .eq("id", singleTxId);
    } else {
      query = query.lt("created_at", minAgeCutoff);
    }

    const { data: stuckTxs, error } = await query;
    if (error) throw error;

    if (!stuckTxs || stuckTxs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No stuck transactions to reconcile", reconciled: 0, refunded: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let reconciled = 0;
    let refunded = 0;
    let stillPending = 0;
    const details: Array<{ id: string; action: string; reason: string }> = [];

    const refundIfDebited = async (tx: any, reason: string) => {
      // Only refund debits where wallet was actually decreased
      if (tx.type !== "debit") return false;
      const before = Number(tx.balance_before);
      const after = Number(tx.balance_after);
      const amount = Number(tx.amount);
      if (!(after < before)) return false;
      // Use atomic credit so we don't clobber a wallet that has changed since
      const { error: rpcErr } = await adminSupabase.rpc("atomic_wallet_credit", {
        p_user_id: tx.user_id,
        p_amount: amount,
      });
      if (rpcErr) {
        console.error(`Refund failed for ${tx.id}:`, rpcErr.message);
        return false;
      }
      await adminSupabase.from("ledger_entries").insert({
        transaction_id: tx.id,
        user_id: tx.user_id,
        entry_type: "refund",
        amount,
        balance_before: after,
        balance_after: after + amount,
        reference: tx.reference,
        metadata: { reason, source: "reconcile-transactions" },
      });
      return true;
    };

    for (const tx of stuckTxs) {
      const ageMs = Date.now() - new Date(tx.created_at).getTime();
      const ageMin = ageMs / 60000;

      const { data: vtuOrder } = await adminSupabase
        .from("vtu_orders")
        .select("id, status, api_response, provider_status, provider_message")
        .eq("transaction_id", tx.id)
        .maybeSingle();

      // CASE 1: provider clearly succeeded
      if (vtuOrder && (vtuOrder.status === "success" || vtuOrder.provider_status === "success" || looksSuccessful(vtuOrder.api_response))) {
        await adminSupabase.from("transactions").update({ status: "success" }).eq("id", tx.id);
        await adminSupabase.from("vtu_orders").update({ status: "success", provider_status: "success" }).eq("id", vtuOrder.id);
        reconciled++;
        details.push({ id: tx.id, action: "marked_success", reason: "provider reported success" });
        continue;
      }

      // CASE 2: provider explicitly failed OR message indicates failure
      const explicitFail = vtuOrder && (vtuOrder.status === "failed" || vtuOrder.provider_status === "failed");
      const heuristicFail = vtuOrder && looksFailed(vtuOrder.provider_message, vtuOrder.api_response);
      if (explicitFail || heuristicFail) {
        const didRefund = await refundIfDebited(tx, vtuOrder?.provider_message || "provider reported failure");
        await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", tx.id);
        await adminSupabase.from("vtu_orders").update({ status: "failed", provider_status: "failed" }).eq("id", vtuOrder!.id);
        reconciled++;
        if (didRefund) refunded++;
        details.push({ id: tx.id, action: "marked_failed", reason: vtuOrder?.provider_message || "provider failed" });
        continue;
      }

      // CASE 3: no vtu_order at all — provider call never completed
      if (!vtuOrder) {
        if (ageMin >= forceFailAfterMinutes || singleTxId) {
          const didRefund = await refundIfDebited(tx, "no provider response");
          await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", tx.id);
          reconciled++;
          if (didRefund) refunded++;
          details.push({ id: tx.id, action: "marked_failed", reason: "no vtu_order, force-fail age reached" });
        } else {
          stillPending++;
          details.push({ id: tx.id, action: "kept_pending", reason: "no vtu_order yet, within grace window" });
        }
        continue;
      }

      // CASE 4: vtu_order is still ambiguous (provider_status pending, no clear message)
      if (ageMin >= forceFailAfterMinutes || singleTxId) {
        const didRefund = await refundIfDebited(tx, "force-fail after age cutoff");
        await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", tx.id);
        await adminSupabase.from("vtu_orders").update({ status: "failed", provider_status: "failed" }).eq("id", vtuOrder.id);
        reconciled++;
        if (didRefund) refunded++;
        details.push({ id: tx.id, action: "marked_failed", reason: "force-failed (older than cutoff, ambiguous provider)" });
      } else {
        stillPending++;
      }
    }

    // Cleanup old metrics (30 days) and resolved fraud flags (90 days) — skip when single-tx mode
    if (!singleTxId) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      await adminSupabase.from("provider_metrics").delete().lt("created_at", thirtyDaysAgo);
      await adminSupabase.from("fraud_flags").delete().eq("resolved", true).lt("created_at", ninetyDaysAgo);
    }

    console.log(`Reconciliation: ${reconciled} reconciled, ${refunded} refunded, ${stillPending} still pending`);

    return new Response(
      JSON.stringify({ success: true, reconciled, refunded, still_pending: stillPending, total_examined: stuckTxs.length, details }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Reconciliation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
