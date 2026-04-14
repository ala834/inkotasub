import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCache } from "../_shared/plan-cache.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { smeplugGetDataPlans, isSmeplugConfigured } from "../_shared/smeplug-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SMEPLUG_NETWORK_MAP: Record<string, number> = {
  MTN: 1, AIRTEL: 2, "9MOBILE": 3, ETISALAT: 3, GLO: 4,
};

function categorizePlan(planName: string): string {
  const name = planName.toUpperCase();
  if (name.includes('CORPORATE') || name.includes('CG')) return 'Corporate';
  if (name.includes('GIFTING') || name.includes('GIFT')) return 'Gifting';
  if (name.includes('DIRECT')) return 'Direct';
  if (name.includes('SME2') || name.includes('SME 2')) return 'SME2';
  if (name.includes('SME')) return 'SME';
  return 'General';
}

function extractDataSize(planName: string): number {
  const name = planName.toUpperCase();
  const gbMatch = name.match(/(\d+(?:\.\d+)?)\s*GB/i);
  if (gbMatch) return parseFloat(gbMatch[1]) * 1024;
  const mbMatch = name.match(/(\d+(?:\.\d+)?)\s*MB/i);
  if (mbMatch) return parseFloat(mbMatch[1]);
  return 99999;
}

function networkNameFromId(id: number): string {
  const map: Record<number, string> = { 1: "MTN", 2: "AIRTEL", 3: "9MOBILE", 4: "GLO" };
  return map[id] || "UNKNOWN";
}

// Map DB plan_type (uppercase) to user-friendly category names
function mapPlanTypeToCategory(planType: string): string {
  switch (planType) {
    case 'SME': return 'SME';
    case 'GIFTING': return 'Gifting';
    case 'CORPORATE': return 'Corporate';
    case 'GENERAL': return 'General';
    default: return planType || 'General';
  }
}

const PLAN_CACHE_TTL = 5 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: any = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid or missing JSON body. Send { network: 'mtn' }" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const network = body.network || body.provider;
    const includeBasePrice = body.includeBasePrice;
    const forceRefresh = body.forceRefresh === true;

    if (!network) {
      return new Response(
        JSON.stringify({ error: "Network/provider is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = req.headers.get("x-forwarded-for") || "anonymous";
    const rateCheck = checkRateLimit(clientId, "get-data-plans", { maxRequests: 20, windowMs: 60000 });
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);
    }

    const authHeader = req.headers.get("Authorization");
    let isAgent = false;
    if (authHeader?.startsWith("Bearer ")) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("is_agent").eq("user_id", user.id).single();
        isAgent = profile?.is_agent || false;
      }
    }

    const networkUpper = network.toUpperCase();
    const cacheKey = `data-plans:${networkUpper}`;
    let basePlans: any[] | null = forceRefresh ? null : getCached<any[]>(cacheKey);
    let source = "cache";

    if (!basePlans) {
      basePlans = [];
      source = "fallback";

      const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      // 1. Try database first (only enabled plans)
      try {
        const { data: dbPlans } = await adminSupabase
          .from("service_plans")
          .select("*")
          .eq("service_type", "data")
          .eq("network", networkUpper)
          .eq("is_enabled", true);

        if (dbPlans && dbPlans.length > 0) {
          basePlans = dbPlans.map((plan: any) => ({
            id: plan.plan_id,
            name: plan.plan_name,
            amount: parseFloat(plan.base_price),
            baseAmount: parseFloat(plan.base_price),
            sellingPrice: plan.selling_price ? parseFloat(plan.selling_price) : null,
            validity: plan.validity || "30 Days",
            dataSize: extractDataSize(plan.plan_name),
            category: mapPlanTypeToCategory(plan.plan_type || '') || categorizePlan(plan.plan_name),
            isFeatured: plan.is_featured || false,
            provider: plan.provider || "subpadi",
          }));
          source = "database";
          console.log(`Loaded ${basePlans.length} data plans for ${network} from database`);
        }
      } catch (dbError) {
        console.error("DB plans error:", dbError);
      }

      // 2. Try SMEPlug API if DB has no plans
      if (basePlans.length === 0 && isSmeplugConfigured()) {
        try {
          console.log(`Fetching data plans from SMEPlug API for ${networkUpper}...`);
          const smeplugResult = await smeplugGetDataPlans();
          
          if (smeplugResult.success && smeplugResult.rawResponse) {
            const raw = smeplugResult.rawResponse as any;
            let allPlans: any[] = [];
            
            if (Array.isArray(raw)) {
              allPlans = raw;
            } else if (Array.isArray(raw?.data)) {
              allPlans = raw.data;
            } else if (Array.isArray(raw?.plans)) {
              allPlans = raw.plans;
            } else {
              // Handle object-keyed format: { data: { "1": [...], "2": [...] } } or { "1": [...] }
              const dataObj = raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : raw;
              if (dataObj && typeof dataObj === "object") {
                for (const key of Object.keys(dataObj)) {
                  if (Array.isArray(dataObj[key])) {
                    allPlans.push(...dataObj[key].map((p: any) => ({ ...p, _network_key: key })));
                  }
                }
              }
            }
            
            console.log(`SMEPlug API returned ${allPlans.length} total plans`);
            
            const targetNetworkId = SMEPLUG_NETWORK_MAP[networkUpper];
            
            const networkPlans = allPlans.filter((p: any) => {
              const planNetworkId = p.network_id || p.network || p._network_key;
              const planNetworkName = String(p.network_name || p.network || "").toUpperCase();
              
              if (targetNetworkId && (planNetworkId == targetNetworkId || planNetworkId == String(targetNetworkId))) return true;
              if (planNetworkName.includes(networkUpper)) return true;
              if (networkUpper === "9MOBILE" && (planNetworkName.includes("ETISALAT") || planNetworkName.includes("9MOBILE"))) return true;
              return false;
            });

            if (networkPlans.length > 0) {
              basePlans = networkPlans.map((p: any) => {
                const planName = p.plan_name || p.name || p.plan || `${p.size || ''} Data`;
                const price = parseFloat(p.price || p.amount || p.cost || 0);
                const planId = String(p.plan_id || p.id || p.dataplan_id || '');
                const validity = p.validity || p.duration || p.plan_validity || "30 Days";

                return {
                  id: planId,
                  name: planName,
                  amount: price,
                  baseAmount: price,
                  validity: validity,
                  dataSize: extractDataSize(planName),
                  category: categorizePlan(planName),
                  provider: "smeplug",
                };
              }).filter((p: any) => p.id && p.amount > 0 && p.name);

              source = "smeplug";
            }
          }
        } catch (smeplugError) {
          console.error("SMEPlug API error:", smeplugError);
        }
      }

      // 3. Final fallback to hardcoded plans
      if (basePlans.length === 0) {
        basePlans = getFallbackPlans(network);
        source = "fallback";
      }

      // Deduplicate by plan ID
      const seen = new Set<string>();
      basePlans = basePlans.filter((p: any) => {
        const key = `${p.provider || 'unknown'}:${p.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Sort: featured first, then by data size, then by price
      basePlans.sort((a: any, b: any) => {
        // Featured plans first
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        if (a.dataSize !== b.dataSize) return a.dataSize - b.dataSize;
        return a.name.localeCompare(b.name);
      });

      if (basePlans.length > 0 && source !== "fallback") {
        setCache(cacheKey, basePlans, PLAN_CACHE_TTL);
      }
    }

    // Get pricing config (not cached - always fresh)
    const pricingSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const userType = isAgent ? 'agent' : 'user';
    const { data: pricingConfigs } = await pricingSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "data")
      .eq("is_active", true)
      .eq("user_type", userType);

    const pricedPlans = basePlans.map((plan: any) => {
      if (plan.sellingPrice && plan.sellingPrice > 0) {
        const result: any = {
          id: plan.id,
          name: plan.name,
          amount: plan.sellingPrice,
          validity: plan.validity,
          category: plan.category || 'General',
          dataSize: plan.dataSize,
          isFeatured: plan.isFeatured || false,
          provider: plan.provider || null,
        };
        if (includeBasePrice) result.baseAmount = plan.amount;
        return result;
      }

      const costPrice = plan.amount;
      const config = pricingConfigs?.find((c: any) => c.network === networkUpper && c.plan_id === plan.id)
        || pricingConfigs?.find((c: any) => c.network === networkUpper && !c.plan_id)
        || pricingConfigs?.find((c: any) => !c.network && !c.plan_id);

      let finalPrice = costPrice;
      if (config) {
        if (config.profit_type === 'percentage') {
          finalPrice = Math.round(costPrice * (1 + config.profit_value / 100));
        } else {
          finalPrice = costPrice + config.profit_value;
        }
      }

      const result: any = {
        id: plan.id,
        name: plan.name,
        amount: finalPrice,
        validity: plan.validity,
        category: plan.category || 'General',
        dataSize: plan.dataSize,
        isFeatured: plan.isFeatured || false,
        provider: plan.provider || null,
      };
      if (includeBasePrice) result.baseAmount = plan.amount;
      return result;
    });

    return new Response(
      JSON.stringify({ plans: pricedPlans, source, cached: source === "cache", totalPlans: pricedPlans.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getFallbackPlans(network: string) {
  const networkPlans: Record<string, any[]> = {
    mtn: [
      { id: "mtn_500mb", name: "500MB SME", amount: 150, validity: "30 Days", dataSize: 500, category: "SME" },
      { id: "mtn_1gb", name: "1GB SME", amount: 300, validity: "30 Days", dataSize: 1024, category: "SME" },
      { id: "mtn_2gb", name: "2GB SME", amount: 600, validity: "30 Days", dataSize: 2048, category: "SME" },
      { id: "mtn_3gb", name: "3GB SME", amount: 900, validity: "30 Days", dataSize: 3072, category: "SME" },
      { id: "mtn_5gb", name: "5GB SME", amount: 1500, validity: "30 Days", dataSize: 5120, category: "SME" },
      { id: "mtn_10gb", name: "10GB SME", amount: 3000, validity: "30 Days", dataSize: 10240, category: "SME" },
    ],
    airtel: [
      { id: "airtel_500mb", name: "500MB", amount: 150, validity: "30 Days", dataSize: 500, category: "General" },
      { id: "airtel_1gb", name: "1GB", amount: 300, validity: "30 Days", dataSize: 1024, category: "General" },
      { id: "airtel_2gb", name: "2GB", amount: 600, validity: "30 Days", dataSize: 2048, category: "General" },
      { id: "airtel_5gb", name: "5GB", amount: 1500, validity: "30 Days", dataSize: 5120, category: "General" },
    ],
    glo: [
      { id: "glo_500mb", name: "500MB", amount: 130, validity: "30 Days", dataSize: 500, category: "General" },
      { id: "glo_1gb", name: "1GB", amount: 260, validity: "30 Days", dataSize: 1024, category: "General" },
      { id: "glo_2gb", name: "2GB", amount: 520, validity: "30 Days", dataSize: 2048, category: "General" },
      { id: "glo_5gb", name: "5GB", amount: 1300, validity: "30 Days", dataSize: 5120, category: "General" },
    ],
    "9mobile": [
      { id: "9mobile_500mb", name: "500MB", amount: 140, validity: "30 Days", dataSize: 500, category: "General" },
      { id: "9mobile_1gb", name: "1GB", amount: 280, validity: "30 Days", dataSize: 1024, category: "General" },
      { id: "9mobile_2gb", name: "2GB", amount: 560, validity: "30 Days", dataSize: 2048, category: "General" },
    ],
  };
  return networkPlans[network.toLowerCase()] || networkPlans.mtn;
}
