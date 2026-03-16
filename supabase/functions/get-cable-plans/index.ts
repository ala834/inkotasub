import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider } = await req.json();
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

    let basePlans: any[] = [];
    let source = "fallback";

    // Try Subpadi first
    const subpadiToken = Deno.env.get("SUBPADI_API_TOKEN");
    if (subpadiToken) {
      try {
        console.log("Fetching cable plans from Subpadi for provider:", provider);
        const response = await fetch(`https://subpadi.com/api/v1/cable/plans?service_id=${provider.toLowerCase()}`, {
          method: "GET",
          headers: {
            "Authorization": `Token ${subpadiToken}`,
            "Content-Type": "application/json",
          },
        });

        const apiResponse = await response.json();
        console.log("Subpadi cable plans response:", JSON.stringify(apiResponse).substring(0, 500));

        if (response.ok && apiResponse) {
          const plans = Array.isArray(apiResponse?.data) ? apiResponse.data
            : apiResponse?.data?.plans ? apiResponse.data.plans
            : apiResponse?.results ? apiResponse.results
            : Array.isArray(apiResponse) ? apiResponse : [];

          if (plans.length > 0) {
            basePlans = plans.map((plan: any) => ({
              id: (plan.plan_id || plan.id)?.toString(),
              name: plan.plan_name || plan.name,
              amount: parseFloat(plan.price || plan.amount || plan.selling_price || 0),
            }));
            source = "subpadi";
            console.log("Subpadi cable plans loaded:", basePlans.length);
          }
        }
      } catch (apiError) {
        console.error("Subpadi cable plans error:", apiError);
      }
    }

    // Fallback to SMEPlug
    if (basePlans.length === 0) {
      const smeplugApiKey = Deno.env.get("SMEPLUG_API_KEY");
      if (smeplugApiKey) {
        try {
          console.log("Falling back to SMEPlug for cable plans, provider:", provider);
          const response = await fetch(`https://smeplug.ng/api/v1/cable/plans?service_id=${provider.toLowerCase()}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${smeplugApiKey}`,
              "Content-Type": "application/json",
            },
          });

          const apiResponse = await response.json();
          if (apiResponse?.status === "success" && apiResponse?.data) {
            const plans = Array.isArray(apiResponse.data) ? apiResponse.data : apiResponse.data?.plans || [];
            basePlans = plans.map((plan: any) => ({
              id: plan.plan_id || plan.id?.toString(),
              name: plan.plan_name || plan.name,
              amount: parseFloat(plan.price || plan.amount || 0),
            }));
            source = "smeplug";
          }
        } catch (apiError) {
          console.error("SMEPlug cable plans error:", apiError);
        }
      }
    }

    // Final fallback
    if (basePlans.length === 0) {
      basePlans = getFallbackPlans(provider);
      source = "fallback";
    }

    // Get pricing config
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const userType = isAgent ? 'agent' : 'user';
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "cable")
      .eq("is_active", true)
      .eq("user_type", userType);

    const pricedPlans = basePlans.map((plan: any) => {
      const costPrice = plan.amount;
      const config = pricingConfigs?.find((c: any) => c.network === provider.toUpperCase() && c.plan_id === plan.id)
        || pricingConfigs?.find((c: any) => c.network === provider.toUpperCase() && !c.plan_id)
        || pricingConfigs?.find((c: any) => !c.network && !c.plan_id);

      let finalPrice = costPrice;
      if (config) {
        if (config.profit_type === 'percentage') {
          finalPrice = Math.round(costPrice * (1 + config.profit_value / 100));
        } else {
          finalPrice = costPrice + config.profit_value;
        }
      }

      return { ...plan, amount: finalPrice };
    });

    return new Response(
      JSON.stringify({ plans: pricedPlans, source }),
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

function getFallbackPlans(provider: string) {
  if (provider.toLowerCase() === "dstv") {
    return [
      { id: "dstv_padi", name: "DStv Padi", amount: 2500 },
      { id: "dstv_yanga", name: "DStv Yanga", amount: 3500 },
      { id: "dstv_confam", name: "DStv Confam", amount: 6200 },
      { id: "dstv_compact", name: "DStv Compact", amount: 10500 },
      { id: "dstv_compact_plus", name: "DStv Compact Plus", amount: 16600 },
      { id: "dstv_premium", name: "DStv Premium", amount: 24500 },
    ];
  } else if (provider.toLowerCase() === "gotv") {
    return [
      { id: "gotv_smallie", name: "GOtv Smallie", amount: 1100 },
      { id: "gotv_jinja", name: "GOtv Jinja", amount: 2250 },
      { id: "gotv_jolli", name: "GOtv Jolli", amount: 3300 },
      { id: "gotv_max", name: "GOtv Max", amount: 4850 },
      { id: "gotv_supa", name: "GOtv Supa", amount: 6400 },
    ];
  } else {
    return [
      { id: "startimes_nova", name: "StarTimes Nova", amount: 1200 },
      { id: "startimes_basic", name: "StarTimes Basic", amount: 2000 },
      { id: "startimes_smart", name: "StarTimes Smart", amount: 2800 },
      { id: "startimes_classic", name: "StarTimes Classic", amount: 3000 },
      { id: "startimes_super", name: "StarTimes Super", amount: 5500 },
    ];
  }
}
