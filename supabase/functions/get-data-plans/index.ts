import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    // In production, fetch from SUBPADI API
    // For now, return mock plans
    const plans = getPlans(network);

    return new Response(
      JSON.stringify({ plans }),
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

function getPlans(network: string) {
  const basePlans = [
    { id: "1", name: "500MB", amount: 150, validity: "1 Day" },
    { id: "2", name: "1GB", amount: 300, validity: "1 Day" },
    { id: "3", name: "2GB", amount: 500, validity: "30 Days" },
    { id: "4", name: "3GB", amount: 800, validity: "30 Days" },
    { id: "5", name: "5GB", amount: 1200, validity: "30 Days" },
    { id: "6", name: "10GB", amount: 2500, validity: "30 Days" },
    { id: "7", name: "15GB", amount: 3500, validity: "30 Days" },
    { id: "8", name: "25GB", amount: 5000, validity: "30 Days" },
  ];

  // Adjust prices slightly by network
  const multiplier = network === "mtn" ? 1 : network === "airtel" ? 0.95 : 0.9;
  
  return basePlans.map(plan => ({
    ...plan,
    amount: Math.round(plan.amount * multiplier),
  }));
}
