import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUBPADI_BASE_URL = "https://subpadi.com/api";
const NETWORK_MAP: Record<string, number> = { MTN: 1, GLO: 2, AIRTEL: 3, "9MOBILE": 4 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: role } = await adminSupabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").single();
    if (!role) return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const token = Deno.env.get("SUBPADI_API_TOKEN");
    if (!token) return new Response(JSON.stringify({ error: "SUBPADI_API_TOKEN not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const body = await req.json().catch(() => ({}));
    const action = body.action || "validate"; // "validate" or "cleanup"
    const networkFilter = body.network?.toUpperCase();
    const limit = body.limit || 50; // max plans to validate per request

    const apiHeaders = { "Authorization": `Token ${token}`, "Content-Type": "application/json" };

    // Get plans from DB that have numeric plan_ids (Subpadi IDs)
    let query = adminSupabase
      .from("service_plans")
      .select("id, network, plan_id, plan_name, base_price, is_enabled")
      .eq("service_type", "data")
      .eq("is_enabled", true);

    if (networkFilter) query = query.eq("network", networkFilter);
    const { data: dbPlans } = await query.order("network").limit(1000);

    if (!dbPlans || dbPlans.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No plans to validate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only validate numeric plan IDs (manual string IDs like "mtn_500mb" are fallbacks)
    const numericPlans = dbPlans.filter(p => /^\d+$/.test(p.plan_id));
    const plansToValidate = numericPlans.slice(0, limit);
    
    console.log(`Validating ${plansToValidate.length} of ${numericPlans.length} numeric plans (${dbPlans.length} total)`);

    const results: { valid: any[]; invalid: any[]; errors: any[] } = { valid: [], invalid: [], errors: [] };
    const now = new Date().toISOString();

    // Test each plan by making a dry-run style request
    // We'll use a dummy phone number that won't actually purchase
    // Instead, we can check if the plan ID is valid by sending to /api/data/ 
    // with a clearly invalid phone to get a "plan" error vs "phone" error
    for (const plan of plansToValidate) {
      const networkId = NETWORK_MAP[plan.network];
      if (!networkId) {
        results.errors.push({ plan_id: plan.plan_id, network: plan.network, error: "Unknown network" });
        continue;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const res = await fetch(`${SUBPADI_BASE_URL}/data/`, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({
            network: networkId,
            mobile_number: "00000000000", // dummy - will fail but tells us if plan exists
            plan: parseInt(plan.plan_id, 10),
            Ported_number: true,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }

        // Check if the error is about the plan being invalid
        const planError = data?.plan || data?.Plan;
        const isInvalidPlan = Array.isArray(planError) && planError.some((e: string) => 
          e.includes("Invalid pk") || e.includes("does not exist") || e.includes("not found")
        );

        if (isInvalidPlan) {
          results.invalid.push({ 
            id: plan.id, plan_id: plan.plan_id, network: plan.network, 
            plan_name: plan.plan_name, error: planError.join("; ")
          });
          
          if (action === "cleanup") {
            await adminSupabase.from("service_plans")
              .update({ is_enabled: false, updated_at: now })
              .eq("id", plan.id);
          }
        } else {
          // Plan exists (error would be about phone number, or it might even succeed)
          results.valid.push({ plan_id: plan.plan_id, network: plan.network, plan_name: plan.plan_name });
        }

        // Rate limit: small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (e) {
        results.errors.push({ 
          plan_id: plan.plan_id, network: plan.network, 
          error: e instanceof Error ? e.message : String(e) 
        });
      }
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
