import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCache } from "../_shared/plan-cache.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NETWORK_MAP: Record<string, number> = {
  'MTN': 1, 'GLO': 2, 'AIRTEL': 3, '9MOBILE': 4, 'ETISALAT': 4,
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

const PLAN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const network = body.network || body.provider;
    const includeBasePrice = body.includeBasePrice;

    if (!network) {
      return new Response(
        JSON.stringify({ error: "Network/provider is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit: 20 plan fetches per minute per IP (no auth required)
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

    // Check cache for base plans
    const cacheKey = `data-plans:${network.toUpperCase()}`;
    let basePlans: any[] | null = getCached<any[]>(cacheKey);
    let source = "cache";

    if (!basePlans) {
      basePlans = [];
      source = "fallback";

      // Try Subpadi first
      const subpadiToken = Deno.env.get("SUBPADI_API_TOKEN");
      if (subpadiToken) {
        try {
          const networkId = NETWORK_MAP[network.toUpperCase()];
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(`https://subpadi.com/api/v1/data/plans?network_id=${networkId}`, {
            method: "GET",
            headers: {
              "Authorization": `Token ${subpadiToken}`,
              "Content-Type": "application/json",
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const apiResponse = await response.json();
          console.log("Subpadi data plans status:", response.status);

          if (response.ok && apiResponse) {
            let plans: any[] = [];
            if (apiResponse?.data && typeof apiResponse.data === 'object' && !Array.isArray(apiResponse.data)) {
              for (const key of Object.keys(apiResponse.data)) {
                const group = apiResponse.data[key];
                if (Array.isArray(group)) plans = plans.concat(group);
              }
            } else if (Array.isArray(apiResponse?.data)) {
              plans = apiResponse.data;
            } else if (apiResponse?.results && Array.isArray(apiResponse.results)) {
              plans = apiResponse.results;
            } else if (Array.isArray(apiResponse)) {
              plans = apiResponse;
            }
            if (apiResponse?.data?.plans && Array.isArray(apiResponse.data.plans)) {
              plans = apiResponse.data.plans;
            }

            if (plans.length > 0) {
              basePlans = plans
                .filter((plan: any) => parseFloat(plan.price || plan.amount || plan.selling_price || 0) > 0)
                .map((plan: any) => {
                  const planName = plan.plan_name || plan.name || plan.data_plan || "";
                  const price = parseFloat(plan.price || plan.amount || plan.selling_price || 0);
                  return {
                    id: (plan.plan_id || plan.id)?.toString(),
                    name: planName,
                    amount: price,
                    baseAmount: price,
                    validity: plan.validity || plan.duration || "30 Days",
                    dataSize: extractDataSize(planName),
                    category: categorizePlan(planName),
                  };
                });
              basePlans.sort((a: any, b: any) => a.dataSize - b.dataSize);
              source = "subpadi";
            }
          }
        } catch (apiError) {
          console.error("Subpadi data plans error:", apiError);
        }
      }

      // Fallback to SMEPlug
      if (basePlans.length === 0) {
        const smeplugApiKey = Deno.env.get("SMEPLUG_API_KEY");
        if (smeplugApiKey) {
          try {
            const networkId = NETWORK_MAP[network.toUpperCase()];
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(`https://smeplug.ng/api/v1/data/plans?network_id=${networkId}`, {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${smeplugApiKey}`,
                "Content-Type": "application/json",
              },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const apiResponse = await response.json();
            if ((apiResponse?.status === true || apiResponse?.status === "success") && apiResponse?.data) {
              let plans: any[] = [];
              if (typeof apiResponse.data === 'object' && !Array.isArray(apiResponse.data)) {
                for (const key of Object.keys(apiResponse.data)) {
                  const group = apiResponse.data[key];
                  if (Array.isArray(group)) plans = plans.concat(group);
                }
              } else if (Array.isArray(apiResponse.data)) {
                plans = apiResponse.data;
              }
              if (plans.length === 0 && apiResponse.data?.plans) {
                plans = Array.isArray(apiResponse.data.plans) ? apiResponse.data.plans : [];
              }

              basePlans = plans
                .filter((plan: any) => parseFloat(plan.price || plan.amount || 0) > 0)
                .map((plan: any) => {
                  const planName = plan.plan_name || plan.name || "";
                  return {
                    id: (plan.plan_id || plan.id)?.toString(),
                    name: planName,
                    amount: parseFloat(plan.price || plan.amount || 0),
                    baseAmount: parseFloat(plan.price || plan.amount || 0),
                    validity: plan.validity || plan.duration || "30 Days",
                    dataSize: extractDataSize(planName),
                    category: categorizePlan(planName),
                  };
                });
              basePlans.sort((a: any, b: any) => a.dataSize - b.dataSize);
              source = "smeplug";
            }
          } catch (apiError) {
            console.error("SMEPlug data plans error:", apiError);
          }
        }
      }

      // Final fallback
      if (basePlans.length === 0) {
        basePlans = getFallbackPlans(network);
        source = "fallback";
      }

      // Cache the base plans for 5 minutes
      if (basePlans.length > 0 && source !== "fallback") {
        setCache(cacheKey, basePlans, PLAN_CACHE_TTL);
      }
    }

    // Get pricing config (not cached - always fresh)
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const userType = isAgent ? 'agent' : 'user';
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "data")
      .eq("is_active", true)
      .eq("user_type", userType);

    const pricedPlans = basePlans.map((plan: any) => {
      const costPrice = plan.amount;
      const config = pricingConfigs?.find((c: any) => c.network === network.toUpperCase() && c.plan_id === plan.id)
        || pricingConfigs?.find((c: any) => c.network === network.toUpperCase() && !c.plan_id)
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
      };
      if (includeBasePrice) result.baseAmount = plan.amount;
      return result;
    });

    return new Response(
      JSON.stringify({ plans: pricedPlans, source, cached: source === "cache" }),
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

function extractDataSize(planName: string): number {
  const name = planName.toUpperCase();
  const gbMatch = name.match(/(\d+(?:\.\d+)?)\s*GB/i);
  if (gbMatch) return parseFloat(gbMatch[1]) * 1024;
  const mbMatch = name.match(/(\d+(?:\.\d+)?)\s*MB/i);
  if (mbMatch) return parseFloat(mbMatch[1]);
  return 99999;
}

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
