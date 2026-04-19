// Plan reliability tracker — increments failure counts on provider errors
// and resets them on success. Used by purchase-* functions.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const FAILURE_THRESHOLD = 2;

/**
 * Returns true if a provider failure message looks like a *user* error
 * (wrong number, insufficient wallet, plan restricted, PIN, fraud, etc.)
 * rather than a real provider/plan failure. We do NOT count these.
 */
function isUserError(message?: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("invalid phone") ||
    m.includes("phone number") ||
    m.includes("insufficient balance") && m.includes("wallet") ||
    m.includes("self-recharge") ||
    m.includes("restricted to self") ||
    m.includes("incorrect pin") ||
    m.includes("transaction pin") ||
    m.includes("locked") ||
    m.includes("fraud") ||
    m.includes("rate limit") ||
    m.includes("daily limit")
  );
}

/**
 * Tracks the outcome of a data plan purchase against the underlying plan record.
 * - On success: resets failure_count to 0 and stamps last_success_at.
 * - On provider failure: increments failure_count and records reason/time.
 * User-side errors are ignored to avoid penalizing good plans.
 */
export async function trackPlanOutcome(
  supabase: SupabaseClient,
  opts: {
    serviceType: "data";
    network: string;
    planId: string; // may be DB UUID, api_plan_id, or service_plans.plan_id
    success: boolean;
    failureMessage?: string;
  }
): Promise<void> {
  const { network, planId, success, failureMessage } = opts;
  if (!planId) return;

  // Skip tracking entirely for user-side errors
  if (!success && isUserError(failureMessage)) {
    console.log(`[plan-reliability] Skipping user-error for plan ${planId}: ${failureMessage}`);
    return;
  }

  // 1. Try Flowpay manual plan (id OR api_plan_id)
  try {
    const { data: fp } = await supabase
      .from("flowpay_manual_plans")
      .select("id, failure_count")
      .or(`id.eq.${planId},api_plan_id.eq.${planId}`)
      .maybeSingle();

    if (fp) {
      if (success) {
        await supabase
          .from("flowpay_manual_plans")
          .update({
            failure_count: 0,
            last_success_at: new Date().toISOString(),
            last_failure_reason: null,
          })
          .eq("id", fp.id);
      } else {
        await supabase
          .from("flowpay_manual_plans")
          .update({
            failure_count: (fp.failure_count || 0) + 1,
            last_failure_at: new Date().toISOString(),
            last_failure_reason: (failureMessage || "Unknown provider error").slice(0, 500),
          })
          .eq("id", fp.id);
      }
      return;
    }
  } catch (e) {
    console.error("[plan-reliability] flowpay tracking error:", e);
  }

  // 2. Try service_plans (matched by network + plan_id)
  try {
    const { data: sp } = await supabase
      .from("service_plans")
      .select("id, failure_count")
      .eq("service_type", "data")
      .eq("network", network.toUpperCase())
      .eq("plan_id", String(planId))
      .maybeSingle();

    if (sp) {
      if (success) {
        await supabase
          .from("service_plans")
          .update({
            failure_count: 0,
            last_success_at: new Date().toISOString(),
            last_failure_reason: null,
          })
          .eq("id", sp.id);
      } else {
        await supabase
          .from("service_plans")
          .update({
            failure_count: (sp.failure_count || 0) + 1,
            last_failure_at: new Date().toISOString(),
            last_failure_reason: (failureMessage || "Unknown provider error").slice(0, 500),
          })
          .eq("id", sp.id);
      }
    }
  } catch (e) {
    console.error("[plan-reliability] service_plans tracking error:", e);
  }
}
