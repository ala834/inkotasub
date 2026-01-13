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

    // Get base plans
    const basePlans = getBasePlans(provider);
    
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
    const pricedPlans = basePlans.map(plan => {
      const costPrice = plan.amount;
      
      // Find the most specific pricing config
      let config = pricingConfigs?.find(
        c => c.network === provider.toUpperCase() && c.plan_id === plan.id
      ) || pricingConfigs?.find(
        c => c.network === provider.toUpperCase() && !c.plan_id
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

function getBasePlans(provider: string) {
  // Base costs from SUBPADI
  if (provider === "dstv") {
    return [
      { id: "padi", name: "DStv Padi", amount: 2400 },
      { id: "yanga", name: "DStv Yanga", amount: 3400 },
      { id: "confam", name: "DStv Confam", amount: 6000 },
      { id: "compact", name: "DStv Compact", amount: 10200 },
      { id: "compact_plus", name: "DStv Compact Plus", amount: 16200 },
      { id: "premium", name: "DStv Premium", amount: 24000 },
    ];
  } else if (provider === "gotv") {
    return [
      { id: "smallie", name: "GOtv Smallie", amount: 1050 },
      { id: "jinja", name: "GOtv Jinja", amount: 2150 },
      { id: "jolli", name: "GOtv Jolli", amount: 3200 },
      { id: "max", name: "GOtv Max", amount: 4700 },
      { id: "supa", name: "GOtv Supa", amount: 6200 },
    ];
  } else {
    return [
      { id: "nova", name: "StarTimes Nova", amount: 1150 },
      { id: "basic", name: "StarTimes Basic", amount: 1900 },
      { id: "smart", name: "StarTimes Smart", amount: 2700 },
      { id: "classic", name: "StarTimes Classic", amount: 2900 },
      { id: "super", name: "StarTimes Super", amount: 5300 },
    ];
  }
}