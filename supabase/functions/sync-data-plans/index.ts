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

    const apiHeaders = { "Authorization": `Token ${token}`, "Content-Type": "application/json" };

    // Fetch all data plans from Subpadi GET /api/data/
    console.log("Fetching plans from Subpadi GET /api/data/");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const res = await fetch(`${SUBPADI_BASE_URL}/data/`, {
      method: "GET",
      headers: apiHeaders,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const text = await res.text();
    console.log(`Subpadi /api/data/ response status: ${res.status}, body length: ${text.length}`);
    console.log(`Subpadi /api/data/ first 500 chars: ${text.substring(0, 500)}`);

    let rawData: any;
    try { rawData = JSON.parse(text); } catch {
      return new Response(JSON.stringify({
        success: false,
        message: "Failed to parse Subpadi API response",
        rawPreview: text.substring(0, 200),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // The response could be: an array, { results: [...] }, { data: [...] }, or paginated
    let plans: any[] = [];
    if (Array.isArray(rawData)) {
      plans = rawData;
    } else if (rawData?.results && Array.isArray(rawData.results)) {
      plans = rawData.results;
      // Handle pagination
      let nextUrl = rawData.next;
      while (nextUrl) {
        try {
          const pageRes = await fetch(nextUrl, { method: "GET", headers: apiHeaders });
          const pageData = await pageRes.json();
          if (Array.isArray(pageData?.results)) plans.push(...pageData.results);
          nextUrl = pageData?.next;
        } catch { break; }
      }
    } else if (rawData?.data && Array.isArray(rawData.data)) {
      plans = rawData.data;
    }

    console.log(`Total plans fetched: ${plans.length}`);
    if (plans.length > 0) {
      console.log("Sample plan:", JSON.stringify(plans[0]));
    }

    if (plans.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: "Subpadi API returned no plans. Response structure may have changed.",
        responseKeys: typeof rawData === "object" ? Object.keys(rawData) : typeof rawData,
        sampleData: JSON.stringify(rawData).substring(0, 500),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Map plans to service_plans format
    const now = new Date().toISOString();
    const allPlans = plans.map((p: any) => {
      const networkId = p.network || p.plan_network;
      const networkName = typeof networkId === "number" 
        ? (NETWORK_MAP[networkId] || `NETWORK_${networkId}`)
        : String(networkId || "UNKNOWN").toUpperCase();

      return {
        network: networkName,
        plan_id: String(p.id || p.plan_id || p.dataplan_id),
        plan_name: p.plan || p.name || p.plan_name || p.dataplan || "Unknown Plan",
        base_price: parseFloat(String(p.plan_amount || p.amount || p.price || "0")),
        validity: p.month_validate || p.validity || p.duration || "30 Days",
        service_type: "data",
        is_enabled: true,
        is_manual: false,
        last_synced_at: now,
      };
    }).filter((p: any) => p.plan_id && p.base_price > 0);

    console.log(`Mapped ${allPlans.length} valid plans`);

    // Upsert into service_plans
    let inserted = 0, updated = 0, unchanged = 0;

    for (const plan of allPlans) {
      const { data: existing } = await adminSupabase
        .from("service_plans")
        .select("id, base_price, plan_name")
        .eq("service_type", "data")
        .eq("network", plan.network)
        .eq("plan_id", plan.plan_id)
        .single();

      if (existing) {
        if (existing.base_price !== plan.base_price || existing.plan_name !== plan.plan_name) {
          await adminSupabase.from("service_plans").update({
            plan_name: plan.plan_name,
            base_price: plan.base_price,
            validity: plan.validity,
            last_synced_at: now,
            updated_at: now,
            is_enabled: true,
          }).eq("id", existing.id);
          updated++;
        } else {
          await adminSupabase.from("service_plans").update({ last_synced_at: now }).eq("id", existing.id);
          unchanged++;
        }
      } else {
        await adminSupabase.from("service_plans").insert(plan);
        inserted++;
      }
    }

    // Disable stale non-manual plans
    const syncedNetworks = [...new Set(allPlans.map(p => p.network))];
    let disabled = 0;
    for (const net of syncedNetworks) {
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
          await adminSupabase.from("service_plans")
            .update({ is_enabled: false, updated_at: now })
            .in("id", stalePlans.map(sp => sp.id));
          disabled += stalePlans.length;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Synced ${allPlans.length} plans: ${inserted} new, ${updated} updated, ${unchanged} unchanged, ${disabled} stale disabled`,
      total: allPlans.length,
      inserted, updated, unchanged, disabled,
      networks: syncedNetworks,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
