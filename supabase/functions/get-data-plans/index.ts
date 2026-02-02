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
    const { network, includeBasePrice } = await req.json();
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

    // Call SUBPADI API to get ALL data plans (no filtering)
    const subpadiApiKey = Deno.env.get("SUBPADI_API_KEY");
    const subpadiToken = Deno.env.get("SUBPADI_API_TOKEN");

    let basePlans = [];

    if (subpadiApiKey && subpadiToken) {
      try {
        console.log("Fetching ALL data plans from SUBPADI for network:", network);
        
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
        console.log("SUBPADI data plans response:", JSON.stringify(apiResponse));

        if (apiResponse?.status === "success" && apiResponse?.data?.plans) {
          // Return ALL plans without any filtering
          basePlans = apiResponse.data.plans.map((plan: any) => ({
            id: plan.plan_id || plan.id,
            name: plan.name || plan.plan_name,
            amount: parseFloat(plan.amount || plan.price),
            baseAmount: parseFloat(plan.amount || plan.price), // Store base amount for admin
            validity: plan.validity || plan.duration || "30 Days",
            dataSize: extractDataSize(plan.name || plan.plan_name),
          }));
          
          // Sort by data size (ascending) - smallest first
          basePlans.sort((a: any, b: any) => a.dataSize - b.dataSize);
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

      const result: any = {
        id: plan.id,
        name: plan.name,
        amount: finalPrice,
        validity: plan.validity,
      };
      
      // Include base amount for admin sync purposes
      if (includeBasePrice) {
        result.baseAmount = plan.amount;
      }

      return result;
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

// Extract numeric data size in MB for sorting
function extractDataSize(planName: string): number {
  const name = planName.toUpperCase();
  
  // Match GB patterns
  const gbMatch = name.match(/(\d+(?:\.\d+)?)\s*GB/i);
  if (gbMatch) {
    return parseFloat(gbMatch[1]) * 1024; // Convert to MB
  }
  
  // Match MB patterns
  const mbMatch = name.match(/(\d+(?:\.\d+)?)\s*MB/i);
  if (mbMatch) {
    return parseFloat(mbMatch[1]);
  }
  
  // Default for unknown formats
  return 99999;
}

function getFallbackPlans(network: string) {
  // Complete fallback plans including small bundles (100MB, 250MB, 500MB)
  const networkPlans: Record<string, any[]> = {
    mtn: [
      { id: "mtn_100mb_1d", name: "100MB (1 Day)", amount: 100, validity: "1 Day", dataSize: 100 },
      { id: "mtn_250mb_1d", name: "250MB (1 Day)", amount: 130, validity: "1 Day", dataSize: 250 },
      { id: "mtn_500mb_1d", name: "500MB (1 Day)", amount: 150, validity: "1 Day", dataSize: 500 },
      { id: "mtn_1gb_1d", name: "1GB (1 Day)", amount: 300, validity: "1 Day", dataSize: 1024 },
      { id: "mtn_2gb_30d", name: "2GB (30 Days)", amount: 500, validity: "30 Days", dataSize: 2048 },
      { id: "mtn_3gb_30d", name: "3GB (30 Days)", amount: 800, validity: "30 Days", dataSize: 3072 },
      { id: "mtn_5gb_30d", name: "5GB (30 Days)", amount: 1200, validity: "30 Days", dataSize: 5120 },
      { id: "mtn_10gb_30d", name: "10GB (30 Days)", amount: 2500, validity: "30 Days", dataSize: 10240 },
      { id: "mtn_15gb_30d", name: "15GB (30 Days)", amount: 3500, validity: "30 Days", dataSize: 15360 },
      { id: "mtn_25gb_30d", name: "25GB (30 Days)", amount: 5000, validity: "30 Days", dataSize: 25600 },
    ],
    airtel: [
      { id: "airtel_100mb_1d", name: "100MB (1 Day)", amount: 100, validity: "1 Day", dataSize: 100 },
      { id: "airtel_250mb_1d", name: "250MB (1 Day)", amount: 120, validity: "1 Day", dataSize: 250 },
      { id: "airtel_500mb_1d", name: "500MB (1 Day)", amount: 140, validity: "1 Day", dataSize: 500 },
      { id: "airtel_1gb_1d", name: "1GB (1 Day)", amount: 280, validity: "1 Day", dataSize: 1024 },
      { id: "airtel_2gb_30d", name: "2GB (30 Days)", amount: 480, validity: "30 Days", dataSize: 2048 },
      { id: "airtel_3gb_30d", name: "3GB (30 Days)", amount: 750, validity: "30 Days", dataSize: 3072 },
      { id: "airtel_5gb_30d", name: "5GB (30 Days)", amount: 1150, validity: "30 Days", dataSize: 5120 },
      { id: "airtel_10gb_30d", name: "10GB (30 Days)", amount: 2400, validity: "30 Days", dataSize: 10240 },
    ],
    glo: [
      { id: "glo_100mb_1d", name: "100MB (1 Day)", amount: 90, validity: "1 Day", dataSize: 100 },
      { id: "glo_250mb_1d", name: "250MB (1 Day)", amount: 110, validity: "1 Day", dataSize: 250 },
      { id: "glo_500mb_1d", name: "500MB (1 Day)", amount: 130, validity: "1 Day", dataSize: 500 },
      { id: "glo_1gb_1d", name: "1GB (1 Day)", amount: 260, validity: "1 Day", dataSize: 1024 },
      { id: "glo_2gb_30d", name: "2GB (30 Days)", amount: 450, validity: "30 Days", dataSize: 2048 },
      { id: "glo_5gb_30d", name: "5GB (30 Days)", amount: 1100, validity: "30 Days", dataSize: 5120 },
      { id: "glo_10gb_30d", name: "10GB (30 Days)", amount: 2200, validity: "30 Days", dataSize: 10240 },
    ],
    "9mobile": [
      { id: "9mobile_100mb_1d", name: "100MB (1 Day)", amount: 100, validity: "1 Day", dataSize: 100 },
      { id: "9mobile_250mb_1d", name: "250MB (1 Day)", amount: 120, validity: "1 Day", dataSize: 250 },
      { id: "9mobile_500mb_1d", name: "500MB (1 Day)", amount: 140, validity: "1 Day", dataSize: 500 },
      { id: "9mobile_1gb_1d", name: "1GB (1 Day)", amount: 280, validity: "1 Day", dataSize: 1024 },
      { id: "9mobile_2gb_30d", name: "2GB (30 Days)", amount: 480, validity: "30 Days", dataSize: 2048 },
      { id: "9mobile_5gb_30d", name: "5GB (30 Days)", amount: 1150, validity: "30 Days", dataSize: 5120 },
    ],
  };

  return networkPlans[network.toLowerCase()] || networkPlans.mtn;
}
