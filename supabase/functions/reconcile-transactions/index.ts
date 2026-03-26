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

    // Find pending transactions older than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: pendingTxs, error } = await adminSupabase
      .from("transactions")
      .select("id, user_id, amount, balance_before, balance_after, reference, created_at")
      .eq("status", "pending")
      .lt("created_at", fiveMinutesAgo)
      .limit(50);

    if (error) throw error;
    if (!pendingTxs || pendingTxs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No pending transactions to reconcile", reconciled: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let reconciled = 0;
    let refunded = 0;

    for (const tx of pendingTxs) {
      // Check if there's a matching VTU order
      const { data: vtuOrder } = await adminSupabase
        .from("vtu_orders")
        .select("id, status, api_response")
        .eq("transaction_id", tx.id)
        .single();

      if (vtuOrder) {
        if (vtuOrder.status === "success") {
          // Provider succeeded but transaction stuck as pending - fix it
          const newBalance = tx.balance_after;
          await adminSupabase.from("transactions").update({ status: "success" }).eq("id", tx.id);
          await adminSupabase.from("wallets").update({ balance: newBalance }).eq("user_id", tx.user_id);
          reconciled++;
        } else if (vtuOrder.status === "failed") {
          // Provider failed, transaction pending - mark as failed (no wallet deduction)
          await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", tx.id);
          reconciled++;
        }
      } else {
        // No VTU order exists - transaction was created but provider call never completed
        // This means wallet was never deducted, just mark as failed
        await adminSupabase.from("transactions").update({ status: "failed" }).eq("id", tx.id);
        reconciled++;
      }
    }

    // Clean up old provider metrics (keep 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await adminSupabase.from("provider_metrics").delete().lt("created_at", thirtyDaysAgo);

    // Clean up resolved fraud flags older than 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    await adminSupabase.from("fraud_flags").delete().eq("resolved", true).lt("created_at", ninetyDaysAgo);

    console.log(`Reconciliation complete: ${reconciled} transactions reconciled, ${refunded} refunded`);

    return new Response(
      JSON.stringify({ success: true, reconciled, refunded, total_pending: pendingTxs.length }),
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
