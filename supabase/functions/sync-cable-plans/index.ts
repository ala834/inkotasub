import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUBPADI_BASE_URL = "https://subpadi.com/api";
const PROVIDER_MAP: Record<string, number> = { DSTV: 1, GOTV: 2, STARTIMES: 3 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: role } = await adminSupabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("SUBPADI_API_TOKEN");
    if (!token) return new Response(JSON.stringify({ error: "SUBPADI_API_TOKEN not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const body = await req.json().catch(() => ({}));
    const action = body.action || "validate";
    const providerFilter = body.provider?.toUpperCase();
    const limit = body.limit || 50;

    const apiHeaders = { "Authorization": `Token ${token}`, "Content-Type": "application/json" };

    let query = adminSupabase
      .from("service_plans")
      .select("id, network, plan_id, plan_name, base_price, is_enabled")
      .eq("service_type", "cable")
      .eq("is_enabled", true);

    if (providerFilter) query = query.eq("network", providerFilter);
    const { data: dbPlans } = await query.order("network").limit(1000);

    if (!dbPlans || dbPlans.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No plans to validate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const numericPlans = dbPlans.filter(p => /^\d+$/.test(p.plan_id));
    const plansToValidate = numericPlans.slice(0, limit);

    console.log(`Validating ${plansToValidate.length} of ${numericPlans.length} numeric cable plans`);

    const results: { valid: any[]; invalid: any[]; errors: any[] } = { valid: [], invalid: [], errors: [] };
    const now = new Date().toISOString();

    const BATCH_SIZE = 5;
    for (let i = 0; i < plansToValidate.length; i += BATCH_SIZE) {
      const batch = plansToValidate.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (plan) => {
        const cableId = PROVIDER_MAP[plan.network];
        if (!cableId) {
          results.errors.push({ plan_id: plan.plan_id, network: plan.network, error: "Unknown provider" });
          return;
        }
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(`${SUBPADI_BASE_URL}/cablesub/`, {
            method: "POST", headers: apiHeaders,
            body: JSON.stringify({ cablename: cableId, cableplan: parseInt(plan.plan_id, 10), smart_card_number: "0000000000", bypass: false }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const data = await res.json().catch(() => ({}));

          const planError = data?.cableplan || data?.Cableplan;
          const isInvalid = Array.isArray(planError) && planError.some((e: string) =>
            e.includes("Invalid pk") || e.includes("does not exist")
          );

          if (isInvalid) {
            results.invalid.push({ id: plan.id, plan_id: plan.plan_id, network: plan.network, plan_name: plan.plan_name, error: planError.join("; ") });
            if (action === "cleanup") {
              await adminSupabase.from("service_plans").update({ is_enabled: false, updated_at: now }).eq("id", plan.id);
            }
          } else {
            results.valid.push({ plan_id: plan.plan_id, network: plan.network, plan_name: plan.plan_name });
          }
        } catch (e) {
          results.errors.push({ plan_id: plan.plan_id, network: plan.network, error: e instanceof Error ? e.message : String(e) });
        }
      });
      await Promise.all(promises);
    }

    const cleanupMsg = action === "cleanup"
      ? ` ${results.invalid.length} invalid plans disabled.`
      : ` Use action:"cleanup" to disable invalid plans.`;

    return new Response(JSON.stringify({
      success: true,
      message: `Validated ${plansToValidate.length} plans: ${results.valid.length} valid, ${results.invalid.length} invalid, ${results.errors.length} errors.${cleanupMsg}`,
      totalInDb: dbPlans.length,
      numericPlans: numericPlans.length,
      validated: plansToValidate.length,
      remaining: numericPlans.length - plansToValidate.length,
      validCount: results.valid.length,
      invalidCount: results.invalid.length,
      invalidPlans: results.invalid,
      errors: results.errors.length > 0 ? results.errors : undefined,
      action,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Validation error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
