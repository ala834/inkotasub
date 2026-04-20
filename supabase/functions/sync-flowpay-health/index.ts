// Periodic Flowpay plan health-check.
// Runs every 6 hours via pg_cron. Verifies Flowpay reachability, then gives
// previously-failing plans a fresh chance by resetting their failure_count
// (so they reappear for users and get re-tested by the next real purchase).
// Permanently disabled plans and admin-disabled plans are NEVER touched.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { flowpayGetBalance, isFlowpayConfigured } from "../_shared/flowpay-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Plans whose last failure happened more than this many hours ago will be retried.
const RETRY_AFTER_HOURS = 6;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!isFlowpayConfigured()) {
      return new Response(
        JSON.stringify({ success: false, message: "Flowpay not configured", retried: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Verify Flowpay is actually reachable. If not, skip — no point resetting.
    const health = await flowpayGetBalance();
    console.log(`[sync-flowpay-health] Flowpay health:`, health.success, health.message);
    if (!health.success) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Flowpay unreachable: ${health.message}`,
          retried: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Find unstable Flowpay plans (failure_count >= 2) that aren't permanently disabled
    //    and haven't failed in the last RETRY_AFTER_HOURS hours.
    const cutoff = new Date(Date.now() - RETRY_AFTER_HOURS * 3600 * 1000).toISOString();
    const { data: candidates, error: fetchError } = await adminSupabase
      .from("flowpay_manual_plans")
      .select("id, plan_name, network, failure_count, last_failure_at")
      .gte("failure_count", 2)
      .eq("permanently_disabled", false)
      .eq("is_enabled", true)
      .or(`last_failure_at.is.null,last_failure_at.lte.${cutoff}`);

    if (fetchError) {
      console.error("[sync-flowpay-health] fetch error:", fetchError.message);
      return new Response(
        JSON.stringify({ success: false, message: fetchError.message, retried: 0 }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ids = (candidates || []).map((c) => c.id);
    if (ids.length === 0) {
      console.log("[sync-flowpay-health] No unstable Flowpay plans eligible for retry.");
      return new Response(
        JSON.stringify({ success: true, message: "Nothing to retry", retried: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Reset failure_count so they reappear and get re-tested by real purchases.
    //    Keep last_failure_at/last_failure_reason as historical info.
    const { error: updateError } = await adminSupabase
      .from("flowpay_manual_plans")
      .update({ failure_count: 0 })
      .in("id", ids);

    if (updateError) {
      console.error("[sync-flowpay-health] update error:", updateError.message);
      return new Response(
        JSON.stringify({ success: false, message: updateError.message, retried: 0 }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[sync-flowpay-health] Reset failure_count for ${ids.length} plan(s):`,
      (candidates || []).map((c) => `${c.network}/${c.plan_name}`).join(", "));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Re-enabled ${ids.length} plan(s) for testing`,
        retried: ids.length,
        plans: (candidates || []).map((c) => ({
          id: c.id,
          network: c.network,
          plan_name: c.plan_name,
          previous_failure_count: c.failure_count,
        })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[sync-flowpay-health] error:", msg);
    return new Response(
      JSON.stringify({ success: false, message: msg, retried: 0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
