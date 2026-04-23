import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Find stuck pending AND processing transactions older than 5 minutes
    const { data: stuckTxs, error } = await adminSupabase
      .from("transactions")
      .select("id, user_id, amount, balance_before, balance_after, reference, created_at, status")
      .in("status", ["pending", "processing"])
      .lt("created_at", fiveMinutesAgo)
      .limit(50);

    if (error) throw error;
    if (!stuckTxs || stuckTxs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No stuck transactions to reconcile", reconciled: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let reconciled = 0;
    let refunded = 0;

    const looksSuccessful = (value: unknown) => {
      const status = String((value as any)?.status ?? (value as any)?.Status ?? (value as any)?.current_status ?? "").toLowerCase();
      return status === "success" || status === "successful" || (value as any)?.success === true;
    };

    for (const tx of stuckTxs) {
      const { data: vtuOrder } = await adminSupabase
        .from("vtu_orders")
        .select("id, status, api_response, provider_status, provider_message")
        .eq("transaction_id", tx.id)
        .single();

      if (vtuOrder) {
        if (vtuOrder.status === "success" || vtuOrder.provider_status === "success" || looksSuccessful(vtuOrder.api_response)) {
          // Provider succeeded but transaction stuck — finalize
          await adminSupabase.from("transactions").update({ status: "success" }).eq("id", tx.id);
          await adminSupabase.from("vtu_orders").update({ status: "success", provider_status: "success" }).eq("id", vtuOrder.id);
          // Wallet was already deducted during "processing" state, so no wallet change needed
          reconciled++;
        } else if (vtuOrder.status === "failed" || vtuOrder.provider_status === "failed") {
          // Provider failed — if we already deducted (processing state), refund
          if (tx.status === "processing") {
            await adminSupabase.from("wallets").update({ balance: tx.balance_before }).eq("user_id", tx.user_id);
            refunded++;
          }
          await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", tx.id);
          reconciled++;
        } else {
          await adminSupabase.from("transactions").update({ status: "pending" }).eq("id", tx.id);
        }
      } else {
        // No VTU order — provider call never completed
        if (tx.status === "processing") {
          // Wallet was deducted but provider never responded — refund
          await adminSupabase.from("wallets").update({ balance: tx.balance_before }).eq("user_id", tx.user_id);
          refunded++;
        }
        await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", tx.id);
        reconciled++;
      }
    }

    // Cleanup old metrics (30 days) and resolved fraud flags (90 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    await adminSupabase.from("provider_metrics").delete().lt("created_at", thirtyDaysAgo);
    await adminSupabase.from("fraud_flags").delete().eq("resolved", true).lt("created_at", ninetyDaysAgo);

    console.log(`Reconciliation: ${reconciled} reconciled, ${refunded} refunded`);

    return new Response(
      JSON.stringify({ success: true, reconciled, refunded, total_stuck: stuckTxs.length }),
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
