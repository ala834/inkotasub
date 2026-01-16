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
    const { network } = await req.json();
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

    // Call SUBPADI API to get real data plans
    const subpadiApiKey = Deno.env.get("SUBPADI_API_KEY");
    const subpadiToken = Deno.env.get("SUBPADI_API_TOKEN");

    let basePlans = [];

    if (subpadiApiKey && subpadiToken) {
      try {
        console.log("Fetching data plans from SUBPADI for network:", network);
        
        const response = await fetch("https://subpadi.com/api/data/plans", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${subpadiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: subpadiApiKey,
            network: network.toUpperCase(),
          }),
        });

        const apiResponse = await response.json();
        console.log("SUBPADI data plans response:", apiResponse);

        if (apiResponse?.status === "success" && apiResponse?.data?.plans) {
          basePlans = apiResponse.data.plans.map((plan: any) => ({
            id: plan.plan_id || plan.id,
            name: plan.name || plan.plan_name,
            amount: parseFloat(plan.amount || plan.price),
            validity: plan.validity || plan.duration || "30 Days",
          }));
        } else {
          // Use fallback plans if API doesn't return valid data
          basePlans = getFallbackPlans(network);
        }
      } catch (apiError) {
        console.error("SUBPADI API error:", apiError);
        basePlans = getFallbackPlans(network);
      }
    } else {
      basePlans = getFallbackPlans(network);
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
      .eq("service_type", "data")
      .eq("is_active", true)
      .eq("user_type", userType);

    // Apply pricing to each plan
    const pricedPlans = basePlans.map((plan: any) => {
      const costPrice = plan.amount;
      
      // Find the most specific pricing config
      const config = pricingConfigs?.find(
        (c: any) => c.network === network.toUpperCase() && c.plan_id === plan.id
      ) || pricingConfigs?.find(
        (c: any) => c.network === network.toUpperCase() && !c.plan_id
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

function getFallbackPlans(network: string) {
  // Fallback plans based on current SUBPADI pricing (updated regularly)
  const networkPlans: Record<string, any[]> = {
    mtn: [
      { id: "mtn_500mb_1d", name: "500MB (1 Day)", amount: 150, validity: "1 Day" },
      { id: "mtn_1gb_1d", name: "1GB (1 Day)", amount: 300, validity: "1 Day" },
      { id: "mtn_2gb_30d", name: "2GB (30 Days)", amount: 500, validity: "30 Days" },
      { id: "mtn_3gb_30d", name: "3GB (30 Days)", amount: 800, validity: "30 Days" },
      { id: "mtn_5gb_30d", name: "5GB (30 Days)", amount: 1200, validity: "30 Days" },
      { id: "mtn_10gb_30d", name: "10GB (30 Days)", amount: 2500, validity: "30 Days" },
      { id: "mtn_15gb_30d", name: "15GB (30 Days)", amount: 3500, validity: "30 Days" },
      { id: "mtn_25gb_30d", name: "25GB (30 Days)", amount: 5000, validity: "30 Days" },
    ],
    airtel: [
      { id: "airtel_500mb_1d", name: "500MB (1 Day)", amount: 140, validity: "1 Day" },
      { id: "airtel_1gb_1d", name: "1GB (1 Day)", amount: 280, validity: "1 Day" },
      { id: "airtel_2gb_30d", name: "2GB (30 Days)", amount: 480, validity: "30 Days" },
      { id: "airtel_3gb_30d", name: "3GB (30 Days)", amount: 750, validity: "30 Days" },
      { id: "airtel_5gb_30d", name: "5GB (30 Days)", amount: 1150, validity: "30 Days" },
      { id: "airtel_10gb_30d", name: "10GB (30 Days)", amount: 2400, validity: "30 Days" },
    ],
    glo: [
      { id: "glo_500mb_1d", name: "500MB (1 Day)", amount: 130, validity: "1 Day" },
      { id: "glo_1gb_1d", name: "1GB (1 Day)", amount: 260, validity: "1 Day" },
      { id: "glo_2gb_30d", name: "2GB (30 Days)", amount: 450, validity: "30 Days" },
      { id: "glo_5gb_30d", name: "5GB (30 Days)", amount: 1100, validity: "30 Days" },
      { id: "glo_10gb_30d", name: "10GB (30 Days)", amount: 2200, validity: "30 Days" },
    ],
    "9mobile": [
      { id: "9mobile_500mb_1d", name: "500MB (1 Day)", amount: 140, validity: "1 Day" },
      { id: "9mobile_1gb_1d", name: "1GB (1 Day)", amount: 280, validity: "1 Day" },
      { id: "9mobile_2gb_30d", name: "2GB (30 Days)", amount: 480, validity: "30 Days" },
      { id: "9mobile_5gb_30d", name: "5GB (30 Days)", amount: 1150, validity: "30 Days" },
    ],
  };

  return networkPlans[network.toLowerCase()] || networkPlans.mtn;
}
