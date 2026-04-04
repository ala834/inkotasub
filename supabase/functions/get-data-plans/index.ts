import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCached, setCache } from "../_shared/plan-cache.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const cacheKey = `data-plans:${network.toUpperCase()}`;
    let basePlans: any[] | null = forceRefresh ? null : getCached<any[]>(cacheKey);
    let source = "cache";

    if (!basePlans) {
      basePlans = [];
      source = "fallback";

      // NOTE: Subpadi API does NOT have a dedicated plan-listing endpoint.
      // GET /api/data/ returns transaction history, not available plans.
      // Data plans must be configured in the service_plans database table
      // with plan IDs from the Subpadi dashboard documentation page.

      // Check service_plans table (primary source for plans)
      try {
        const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: dbPlans } = await adminSupabase
          .from("service_plans")
          .select("*")
          .eq("service_type", "data")
          .eq("network", network.toUpperCase())
          .eq("is_enabled", true);

        if (dbPlans && dbPlans.length > 0) {
          basePlans = dbPlans.map((plan: any) => ({
            id: plan.plan_id,
            name: plan.plan_name,
            amount: parseFloat(plan.base_price),
            baseAmount: parseFloat(plan.base_price),
            validity: plan.validity || "30 Days",
            dataSize: extractDataSize(plan.plan_name),
            category: categorizePlan(plan.plan_name),
          }));
          source = "database";
          console.log(`Loaded ${basePlans.length} data plans for ${network} from database`);
        }
      } catch (dbError) {
        console.error("DB plans error:", dbError);
      }

      // Final fallback
      if (basePlans.length === 0) {
        basePlans = getFallbackPlans(network);
        source = "fallback";
        console.log(`Using ${basePlans.length} fallback data plans for ${network}`);
      }

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
