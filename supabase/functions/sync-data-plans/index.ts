import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUBPADI_BASE_URL = "https://subpadi.com/api";
const NETWORK_MAP: Record<number, string> = { 1: "MTN", 2: "GLO", 3: "AIRTEL", 4: "9MOBILE" };
const NETWORK_IDS = [1, 2, 3, 4];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Verify admin
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: role } = await adminSupabase
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").single();
    if (!role) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("SUBPADI_API_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "SUBPADI_API_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = { "Authorization": `Token ${token}`, "Content-Type": "application/json" };
    const body = await req.json().catch(() => ({}));
    const networkFilter = body.network?.toUpperCase();

    const allPlans: any[] = [];
    const errors: string[] = [];

    // Try multiple possible Subpadi plan-listing endpoints
    for (const networkId of NETWORK_IDS) {
      const networkName = NETWORK_MAP[networkId];
      if (networkFilter && networkName !== networkFilter) continue;

      // Attempt 1: GET /api/data/?network=N (some Subpadi versions expose this)
      // Attempt 2: GET /api/data/plans/ or /api/databundle/
      const endpoints = [
        `${SUBPADI_BASE_URL}/data/?network=${networkId}`,
        `${SUBPADI_BASE_URL}/databundle/?network=${networkId}`,
      ];

      let found = false;
      for (const url of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
          clearTimeout(timeoutId);

          const text = await res.text();
          let data: any;
          try { data = JSON.parse(text); } catch { continue; }

          // Check if we got an array of plans
          const plans = Array.isArray(data) ? data : data?.plans || data?.data || data?.results;
          if (Array.isArray(plans) && plans.length > 0) {
            console.log(`Found ${plans.length} plans for ${networkName} from ${url}`);
            for (const p of plans) {
              allPlans.push({
                network: networkName,
                plan_id: String(p.id || p.plan_id || p.dataplan_id),
                plan_name: p.plan || p.name || p.plan_name || p.dataplan || `${networkName} Plan`,
                base_price: parseFloat(p.plan_amount || p.amount || p.price || "0"),
                validity: p.month_validate || p.validity || p.duration || "30 Days",
                service_type: "data",
                is_enabled: true,
                is_manual: false,
                last_synced_at: new Date().toISOString(),
              });
            }
            found = true;
            break;
          }
        } catch (e) {
          console.log(`Endpoint ${url} failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (!found) {
        errors.push(`No plan data found for ${networkName} from API`);
      }
    }

    if (allPlans.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: "Could not fetch plans from Subpadi API. The API may not support plan listing. Plans must be managed manually in the admin dashboard.",
        errors,
        tip: "You can add/edit plans manually in the Data Plans tab, using plan IDs from your Subpadi dashboard.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Upsert plans into service_plans table
    const now = new Date().toISOString();
    let inserted = 0, updated = 0, skipped = 0;

    for (const plan of allPlans) {
      // Check if plan already exists
      const { data: existing } = await adminSupabase
        .from("service_plans")
        .select("id, base_price, plan_name")
        .eq("service_type", "data")
        .eq("network", plan.network)
        .eq("plan_id", plan.plan_id)
        .single();

      if (existing) {
        // Update if price or name changed
        if (existing.base_price !== plan.base_price || existing.plan_name !== plan.plan_name) {
          await adminSupabase.from("service_plans").update({
            plan_name: plan.plan_name,
            base_price: plan.base_price,
            validity: plan.validity,
            last_synced_at: now,
            updated_at: now,
          }).eq("id", existing.id);
          updated++;
        } else {
          await adminSupabase.from("service_plans").update({ last_synced_at: now }).eq("id", existing.id);
          skipped++;
        }
      } else {
        await adminSupabase.from("service_plans").insert(plan);
        inserted++;
      }
    }

    // Disable plans that exist in DB but not in API response (stale plans)
    if (allPlans.length > 0) {
      const syncedPlanIds = allPlans.map(p => p.plan_id);
      const networksToSync = [...new Set(allPlans.map(p => p.network))];

      for (const net of networksToSync) {
        const netPlanIds = allPlans.filter(p => p.network === net).map(p => p.plan_id);
        const { data: dbPlans } = await adminSupabase
          .from("service_plans")
          .select("id, plan_id")
          .eq("service_type", "data")
          .eq("network", net)
          .eq("is_enabled", true)
          .eq("is_manual", false);

        if (dbPlans) {
          const stalePlans = dbPlans.filter(dp => !netPlanIds.includes(dp.plan_id));
          if (stalePlans.length > 0) {
            const staleIds = stalePlans.map(sp => sp.id);
            await adminSupabase.from("service_plans")
              .update({ is_enabled: false, updated_at: now })
              .in("id", staleIds);
            console.log(`Disabled ${stalePlans.length} stale plans for ${net}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Synced ${allPlans.length} plans: ${inserted} new, ${updated} updated, ${skipped} unchanged`,
      total: allPlans.length,
      inserted,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
