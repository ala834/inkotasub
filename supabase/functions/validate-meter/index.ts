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
    const { disco, meterNumber, meterType } = await req.json();

    // In production, call SUBPADI validation API
    // For demo, simulate validation
    const isValid = meterNumber.length >= 10;
    
    if (isValid) {
      // Simulate customer name from API
      const customerName = `Customer ${meterNumber.slice(-4)}`;
      
      return new Response(
        JSON.stringify({ 
          customerName,
          meterNumber,
          disco,
          meterType,
          validated: true 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid meter number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
