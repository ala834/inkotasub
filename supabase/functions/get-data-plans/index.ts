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

    // Get base plans from SUBPADI (simulated for now)
    const basePlans = getBasePlans(network);
    
    // Get pricing config from database
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    const userType = isAgent ? 'agent' : 'user';
    
    // Fetch all applicable pricing configs (most specific first)
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "data")
      .eq("is_active", true)
      .eq("user_type", userType);

    // Apply pricing to each plan
    const pricedPlans = basePlans.map(plan => {
      const costPrice = plan.amount;
      
      // Find the most specific pricing config
      let config = pricingConfigs?.find(
        c => c.network === network.toUpperCase() && c.plan_id === plan.id
      ) || pricingConfigs?.find(
        c => c.network === network.toUpperCase() && !c.plan_id
      ) || pricingConfigs?.find(
        c => !c.network && !c.plan_id
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
        // Don't expose cost price to frontend
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

function getBasePlans(network: string) {
  // These are SUBPADI base costs - in production, fetch from SUBPADI API
  const basePlans = [
    { id: "1", name: "500MB", amount: 140, validity: "1 Day" },
    { id: "2", name: "1GB", amount: 280, validity: "1 Day" },
    { id: "3", name: "2GB", amount: 480, validity: "30 Days" },
    { id: "4", name: "3GB", amount: 750, validity: "30 Days" },
    { id: "5", name: "5GB", amount: 1150, validity: "30 Days" },
    { id: "6", name: "10GB", amount: 2400, validity: "30 Days" },
    { id: "7", name: "15GB", amount: 3400, validity: "30 Days" },
    { id: "8", name: "25GB", amount: 4800, validity: "30 Days" },
  ];

  // Adjust base costs slightly by network (SUBPADI pricing varies)
  const multiplier = network === "mtn" ? 1 : network === "airtel" ? 0.95 : 0.9;
  
  return basePlans.map(plan => ({
    ...plan,
    amount: Math.round(plan.amount * multiplier),
  }));
}