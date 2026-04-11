import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { smeplugGetDataPlans, isSmeplugConfigured } from "../_shared/smeplug-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SMEPLUG_NETWORK_MAP: Record<number, string> = { 1: "MTN", 2: "AIRTEL", 3: "9MOBILE", 4: "GLO" };
const SUBPADI_NETWORK_MAP: Record<number, string> = { 1: "MTN", 2: "GLO", 3: "AIRTEL", 4: "9MOBILE" };
const SUBPADI_BASE_URL = "https://subpadi.com/api";

function extractDataSize(name: string): number {
  const gb = name.match(/(\d+(?:\.\d+)?)\s*GB/i);
  if (gb) return parseFloat(gb[1]) * 1024;
  const mb = name.match(/(\d+(?:\.\d+)?)\s*MB/i);
  if (mb) return parseFloat(mb[1]);
  return 99999;
}

function categorizePlan(planName: string): string {
  const name = planName.toUpperCase();
  if (name.includes('CORPORATE')) return 'CORPORATE';
  if (name.includes('GIFTING') || name.includes('GIFT')) return 'GIFTING';
  if (name.includes('SME')) return 'SME';
  return 'GENERAL';
}

function isSubpadiConfigured(): boolean {
  return !!Deno.env.get("SUBPADI_API_TOKEN");
}

// Note: Subpadi does NOT have a plan catalog/listing API endpoint.
// GET /api/data/ returns transaction history, NOT available plans.
// Subpadi plans must be added manually by the admin using plan IDs from the Subpadi dashboard.
// This function returns an empty array with a log explaining why.
async function fetchSubpadiDataPlans(): Promise<{ plans: any[]; message: string }> {
  if (!Deno.env.get("SUBPADI_API_TOKEN")) {
    return { plans: [], message: "SUBPADI_API_TOKEN not configured" };
  }
  
  console.log("Subpadi does not provide a plan catalog API. Plans must be added manually from the Subpadi dashboard.");
  return { 
    plans: [], 
    message: "Subpadi does not have a plan listing API. Add plans manually using plan IDs from the Subpadi dashboard." 
  };
}

function normalizeSubpadiPlans(rawPlans: any[]): any[] {
  const normalized: any[] = [];

  for (const p of rawPlans) {
    // Extract fields - Subpadi plans typically have: id, network, plan_name/name, amount/price, plan_type, etc.
    const networkId = p.network_id || p.network;
    let networkName: string;
    if (typeof networkId === "number" || /^\d+$/.test(String(networkId))) {
      networkName = SUBPADI_NETWORK_MAP[Number(networkId)] || "UNKNOWN";
    } else {
      networkName = String(p.network_name || p.network || "UNKNOWN").toUpperCase();
    }
    if (networkName.includes("ETISALAT")) networkName = "9MOBILE";

    const planName = p.plan_name || p.name || p.plan || p.description || `${p.size || p.volume || ""} Data`;
    const price = parseFloat(p.amount || p.price || p.cost || p.plan_amount || 0);
    const planId = String(p.id || p.plan_id || p.dataplan_id || "");

    if (!planId || price <= 0) {
      continue;
    }

    // Extract validity
    let validity = p.validity || p.duration || p.plan_validity || p.month_validate || "";
    if (!validity && planName) {
      const dayMatch = planName.match(/(\d+)\s*days?/i);
      const monthMatch = planName.match(/(\d+)\s*months?/i);
      if (dayMatch) validity = `${dayMatch[1]} Days`;
      else if (monthMatch) validity = `${monthMatch[1]} Month${parseInt(monthMatch[1]) > 1 ? 's' : ''}`;
      else validity = "30 Days";
    }

    // Determine plan type
    let planType = p.plan_type || p.type || "";
    if (planType) {
      planType = String(planType).toUpperCase();
      if (!["SME", "GIFTING", "CORPORATE", "GENERAL"].includes(planType)) {
        planType = categorizePlan(planName);
      }
    } else {
      planType = categorizePlan(planName);
    }

    normalized.push({
      provider: "subpadi",
      network: networkName,
      plan_id: planId,
      plan_name: planName,
      base_price: price,
      validity: validity || "30 Days",
      data_size: extractDataSize(planName),
      plan_type: planType,
    });
  }

  console.log(`Normalized ${normalized.length} Subpadi plans from ${rawPlans.length} raw plans`);
  return normalized;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await adminSupabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let body: any = {};
    try { body = await req.json(); } catch {}
    const action = body.action || "fetch";

    if (action === "fetch") {
      const allPlans: any[] = [];
      const fetchErrors: string[] = [];

      // 1. Fetch from SMEPlug API
      if (isSmeplugConfigured()) {
        try {
          const result = await smeplugGetDataPlans();
          if (result.success && result.rawResponse) {
            const raw = result.rawResponse as any;
            let plans: any[] = [];
            if (Array.isArray(raw)) plans = raw;
            else if (Array.isArray(raw?.data)) plans = raw.data;
            else if (Array.isArray(raw?.plans)) plans = raw.plans;
            else if (Array.isArray(raw?.result)) plans = raw.result;
            else {
              const dataObj = raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : raw;
              for (const key of Object.keys(dataObj)) {
                if (Array.isArray(dataObj[key])) {
                  plans.push(...dataObj[key].map((p: any) => ({ ...p, _network_key: key })));
                }
              }
            }
            for (const p of plans) {
              const networkId = p.network_id || p.network || p._network_key;
              const networkName = typeof networkId === "number" || /^\d+$/.test(String(networkId))
                ? (SMEPLUG_NETWORK_MAP[Number(networkId)] || "UNKNOWN")
                : String(p.network_name || p.network || "").toUpperCase();
              const planName = p.plan_name || p.name || p.plan || `${p.size || ""} Data`;
              const price = parseFloat(p.price || p.amount || p.cost || 0);
              const planId = String(p.plan_id || p.id || p.dataplan_id || "");
              if (!planId || price <= 0) continue;
              allPlans.push({
                provider: "smeplug",
                network: networkName.includes("ETISALAT") ? "9MOBILE" : networkName,
                plan_id: planId,
                plan_name: planName,
                base_price: price,
                validity: p.validity || p.duration || p.plan_validity || "30 Days",
                data_size: extractDataSize(planName),
                plan_type: categorizePlan(planName),
              });
            }
            console.log(`Fetched ${allPlans.length} SMEPlug plans from API`);
          } else {
            fetchErrors.push(`SMEPlug API: ${result.message}`);
          }
        } catch (e) {
          console.error("SMEPlug fetch error:", e);
          fetchErrors.push(`SMEPlug: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // If no SMEPlug API plans, load from DB
      if (allPlans.filter(p => p.provider === "smeplug").length === 0) {
        const { data: dbSmeplugPlans } = await adminSupabase
          .from("service_plans")
          .select("*")
          .eq("service_type", "data")
          .eq("provider", "smeplug");
        if (dbSmeplugPlans) {
          for (const p of dbSmeplugPlans) {
            allPlans.push({
              provider: "smeplug",
              network: p.network,
              plan_id: p.plan_id,
              plan_name: p.plan_name,
              base_price: parseFloat(p.base_price as any),
              validity: p.validity || "30 Days",
              data_size: extractDataSize(p.plan_name),
              db_id: p.id,
              is_enabled: p.is_enabled,
              is_featured: p.is_featured,
              selling_price: p.selling_price ? parseFloat(p.selling_price as any) : null,
              plan_type: (p as any).plan_type || categorizePlan(p.plan_name),
            });
          }
        }
      }

      // 2. Fetch Subpadi plans from API first, fallback to DB
      let subpadiFromApi = false;
      if (isSubpadiConfigured()) {
        try {
          const rawSubpadiPlans = await fetchSubpadiDataPlans();
          if (rawSubpadiPlans.length > 0) {
            const normalizedPlans = normalizeSubpadiPlans(rawSubpadiPlans);
            allPlans.push(...normalizedPlans);
            subpadiFromApi = true;
            console.log(`Added ${normalizedPlans.length} Subpadi plans from API`);
          } else {
            console.log("No plans from Subpadi API, falling back to DB");
            fetchErrors.push("Subpadi API returned 0 plans");
          }
        } catch (e) {
          console.error("Subpadi API fetch error:", e);
          fetchErrors.push(`Subpadi API: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Fallback: load Subpadi plans from DB if API returned nothing
      if (!subpadiFromApi) {
        const { data: dbPlans } = await adminSupabase
          .from("service_plans")
          .select("*")
          .eq("service_type", "data")
          .eq("provider", "subpadi");
        
        if (dbPlans && dbPlans.length > 0) {
          console.log(`Loading ${dbPlans.length} Subpadi plans from DB`);
          for (const p of dbPlans) {
            allPlans.push({
              provider: "subpadi",
              network: p.network,
              plan_id: p.plan_id,
              plan_name: p.plan_name,
              base_price: parseFloat(p.base_price as any),
              validity: p.validity || "30 Days",
              data_size: extractDataSize(p.plan_name),
              db_id: p.id,
              is_enabled: p.is_enabled,
              is_featured: p.is_featured,
              selling_price: p.selling_price ? parseFloat(p.selling_price as any) : null,
              plan_type: (p as any).plan_type || categorizePlan(p.plan_name),
            });
          }
        } else {
          console.log("No Subpadi plans in DB either");
        }
      }

      // 3. Enrich API plans with existing DB state
      const { data: existingPlans } = await adminSupabase
        .from("service_plans")
        .select("*")
        .eq("service_type", "data");

      const existingMap = new Map((existingPlans || []).map((p: any) => [`${p.provider}:${p.network}:${p.plan_id}`, p]));

      const enrichedPlans = allPlans.map(p => {
        const key = `${p.provider}:${p.network}:${p.plan_id}`;
        const existing = existingMap.get(key);
        if (existing && !p.db_id) {
          return {
            ...p,
            db_id: existing.id,
            is_enabled: existing.is_enabled,
            is_featured: existing.is_featured,
            selling_price: existing.selling_price ? parseFloat(existing.selling_price as any) : null,
            plan_type: (existing as any).plan_type || p.plan_type,
          };
        }
        return {
          ...p,
          db_id: p.db_id || null,
          is_enabled: p.is_enabled ?? false,
          is_featured: p.is_featured ?? false,
          selling_price: p.selling_price ?? null,
        };
      });

      // Deduplicate by provider:network:plan_id
      const seen = new Set<string>();
      const deduped = enrichedPlans.filter(p => {
        const key = `${p.provider}:${p.network}:${p.plan_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      deduped.sort((a: any, b: any) => {
        if (a.network !== b.network) return a.network.localeCompare(b.network);
        if (a.plan_type !== b.plan_type) return a.plan_type.localeCompare(b.plan_type);
        if (a.data_size !== b.data_size) return a.data_size - b.data_size;
        return a.plan_name.localeCompare(b.plan_name);
      });

      const smeplugCount = deduped.filter(p => p.provider === "smeplug").length;
      const subpadiCount = deduped.filter(p => p.provider === "subpadi").length;
      console.log(`Returning ${deduped.length} plans: ${smeplugCount} SMEPlug, ${subpadiCount} Subpadi`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          plans: deduped, 
          total: deduped.length,
          smeplugCount,
          subpadiCount,
          subpadiFromApi,
          errors: fetchErrors.length > 0 ? fetchErrors : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "save_plan") {
      const plan = body.plan;
      if (!plan) {
        return new Response(JSON.stringify({ error: "Plan data required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const upsertData: any = {
        service_type: "data",
        provider: plan.provider || "smeplug",
        network: plan.network,
        plan_id: plan.plan_id,
        plan_name: plan.plan_name,
        base_price: plan.base_price,
        validity: plan.validity || "30 Days",
        is_enabled: plan.is_enabled ?? false,
        is_featured: plan.is_featured ?? false,
        selling_price: plan.selling_price || null,
        plan_type: plan.plan_type || categorizePlan(plan.plan_name),
        last_synced_at: new Date().toISOString(),
      };

      let result;
      if (plan.db_id) {
        const { data, error } = await adminSupabase
          .from("service_plans")
          .update(upsertData)
          .eq("id", plan.db_id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await adminSupabase
          .from("service_plans")
          .upsert(upsertData, { onConflict: "service_type,network,plan_id" })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }

      return new Response(
        JSON.stringify({ success: true, plan: result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "bulk_save") {
      const plans = body.plans;
      if (!Array.isArray(plans)) {
        return new Response(JSON.stringify({ error: "Plans array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let saved = 0;
      for (const plan of plans) {
        const upsertData = {
          service_type: "data" as const,
          provider: plan.provider || "smeplug",
          network: plan.network,
          plan_id: plan.plan_id,
          plan_name: plan.plan_name,
          base_price: plan.base_price,
          validity: plan.validity || "30 Days",
          is_enabled: plan.is_enabled ?? false,
          is_featured: plan.is_featured ?? false,
          selling_price: plan.selling_price || null,
          plan_type: plan.plan_type || categorizePlan(plan.plan_name),
          last_synced_at: new Date().toISOString(),
        };

        const { error } = await adminSupabase
          .from("service_plans")
          .upsert(upsertData, { onConflict: "service_type,network,plan_id" });

        if (!error) saved++;
      }

      return new Response(
        JSON.stringify({ success: true, saved, total: plans.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "sync_to_db") {
      let totalSaved = 0;
      const syncErrors: string[] = [];

      // Sync SMEPlug
      if (isSmeplugConfigured()) {
        try {
          const result = await smeplugGetDataPlans();
          if (result.success && result.rawResponse) {
            const raw = result.rawResponse as any;
            let plans: any[] = [];
            const dataObj = raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : null;
            if (dataObj) {
              for (const key of Object.keys(dataObj)) {
                if (Array.isArray(dataObj[key])) {
                  plans.push(...dataObj[key].map((p: any) => ({ ...p, _network_key: key })));
                }
              }
            }
            for (const p of plans) {
              const networkId = p.network_id || p.network || p._network_key;
              const networkName = typeof networkId === "number" || /^\d+$/.test(String(networkId))
                ? (SMEPLUG_NETWORK_MAP[Number(networkId)] || "UNKNOWN")
                : String(p.network_name || p.network || "").toUpperCase();
              const planName = p.plan_name || p.name || p.plan || `${p.size || ""} Data`;
              const price = parseFloat(p.price || p.amount || p.cost || 0);
              const planId = String(p.plan_id || p.id || p.dataplan_id || "");
              if (!planId || price <= 0) continue;
              const network = networkName.includes("ETISALAT") ? "9MOBILE" : networkName;
              const { error } = await adminSupabase
                .from("service_plans")
                .upsert({
                  service_type: "data",
                  provider: "smeplug",
                  network,
                  plan_id: planId,
                  plan_name: planName,
                  base_price: price,
                  validity: p.validity || p.duration || p.plan_validity || "30 Days",
                  is_enabled: false,
                  is_featured: false,
                  plan_type: categorizePlan(planName),
                  last_synced_at: new Date().toISOString(),
                }, { onConflict: "service_type,network,plan_id" });
              if (!error) totalSaved++;
            }
            console.log(`SMEPlug sync: saved ${totalSaved} plans`);
          } else {
            syncErrors.push(`SMEPlug: ${result.message}`);
          }
        } catch (e) {
          syncErrors.push(`SMEPlug error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Sync Subpadi
      let subpadiSaved = 0;
      if (isSubpadiConfigured()) {
        try {
          const rawPlans = await fetchSubpadiDataPlans();
          if (rawPlans.length > 0) {
            const normalizedPlans = normalizeSubpadiPlans(rawPlans);
            for (const p of normalizedPlans) {
              const { error } = await adminSupabase
                .from("service_plans")
                .upsert({
                  service_type: "data",
                  provider: "subpadi",
                  network: p.network,
                  plan_id: p.plan_id,
                  plan_name: p.plan_name,
                  base_price: p.base_price,
                  validity: p.validity,
                  is_enabled: false,
                  is_featured: false,
                  plan_type: p.plan_type,
                  last_synced_at: new Date().toISOString(),
                }, { onConflict: "service_type,network,plan_id" });
              if (!error) {
                subpadiSaved++;
              } else {
                console.error(`Failed to save Subpadi plan ${p.plan_id}:`, error.message);
              }
            }
            console.log(`Subpadi sync: saved ${subpadiSaved} plans`);
            totalSaved += subpadiSaved;
          } else {
            syncErrors.push("Subpadi API returned 0 plans");
          }
        } catch (e) {
          syncErrors.push(`Subpadi error: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        syncErrors.push("Subpadi API token not configured");
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          saved: totalSaved, 
          subpadiSaved,
          errors: syncErrors.length > 0 ? syncErrors : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
