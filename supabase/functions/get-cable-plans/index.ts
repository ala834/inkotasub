import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider } = await req.json();
    const authHeader = req.headers.get("Authorization");
    
    // Default to user pricing if not authenticated
    let isAgent = false;
    
    if (authHeader?.startsWith("Bearer ")) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const token = authHeader.replace("Bearer ", "");
      const { data: claims } = await supabase.auth.getClaims(token);
      
      if (claims?.claims?.sub) {
        const userId = claims.claims.sub;
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_agent")
          .eq("user_id", userId)
          .single();
        
        isAgent = profile?.is_agent || false;
      }
    }

    // Call SUBPADI API to get real cable plans
    const subpadiApiKey = Deno.env.get("SUBPADI_API_KEY");
    const subpadiToken = Deno.env.get("SUBPADI_API_TOKEN");

    let basePlans = [];

    if (subpadiApiKey && subpadiToken) {
      try {
        console.log("Fetching cable plans from SUBPADI for provider:", provider);
        
        const response = await fetch("https://subpadi.com/api/cable/plans", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${subpadiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: subpadiApiKey,
            provider: provider.toUpperCase(),
          }),
        });

        const apiResponse = await response.json();
        console.log("SUBPADI cable plans response:", apiResponse);

        if (apiResponse?.status === "success" && apiResponse?.data?.plans) {
          basePlans = apiResponse.data.plans.map((plan: any) => ({
            id: plan.plan_id || plan.id,
            name: plan.name || plan.plan_name,
            amount: parseFloat(plan.amount || plan.price),
          }));
        } else {
          basePlans = getFallbackPlans(provider);
        }
      } catch (apiError) {
        console.error("SUBPADI API error:", apiError);
        basePlans = getFallbackPlans(provider);
      }
    } else {
      basePlans = getFallbackPlans(provider);
    }
    
    // Get pricing config from database
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    const userType = isAgent ? 'agent' : 'user';
    
    // Fetch all applicable pricing configs
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "cable")
      .eq("is_active", true)
      .eq("user_type", userType);

    // Apply pricing to each plan
    const pricedPlans = basePlans.map((plan: any) => {
      const costPrice = plan.amount;
      
      // Find the most specific pricing config
      const config = pricingConfigs?.find(
        (c: any) => c.network === provider.toUpperCase() && c.plan_id === plan.id
      ) || pricingConfigs?.find(
        (c: any) => c.network === provider.toUpperCase() && !c.plan_id
      ) || pricingConfigs?.find(
        (c: any) => !c.network && !c.plan_id
      );

      let finalPrice = costPrice;
      
      if (config) {
        if (config.profit_type === 'percentage') {
          finalPrice = Math.round(costPrice * (1 + config.profit_value / 100));
        } else {
          finalPrice = costPrice + config.profit_value;
        }
      }

      return {
        ...plan,
        amount: finalPrice,
      };
    });

    return new Response(
      JSON.stringify({ plans: pricedPlans }),
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
  // Fallback plans based on current pricing (updated regularly)
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
