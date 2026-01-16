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

    const subpadiApiKey = Deno.env.get("SUBPADI_API_KEY");
    const subpadiToken = Deno.env.get("SUBPADI_API_TOKEN");

    if (!subpadiApiKey || !subpadiToken) {
      console.error("SUBPADI credentials not configured");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map disco codes to SUBPADI format
    const discoMapping: Record<string, string> = {
      "ikeja": "IKEDC",
      "eko": "EKEDC",
      "abuja": "AEDC",
      "kano": "KEDCO",
      "port-harcourt": "PHED",
      "ibadan": "IBEDC",
      "kaduna": "KAEDCO",
      "jos": "JED",
      "enugu": "EEDC",
      "benin": "BEDC",
      "yola": "YEDC",
    };

    const discoCode = discoMapping[disco.toLowerCase()] || disco.toUpperCase();

    console.log("Validating meter:", { disco: discoCode, meterNumber, meterType });

    // Call SUBPADI meter validation API
    const response = await fetch("https://subpadi.com/api/electricity/verify", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${subpadiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: subpadiApiKey,
        disco: discoCode,
        meter_number: meterNumber,
        meter_type: meterType.toUpperCase(),
      }),
    });

    const apiResponse = await response.json();
    console.log("SUBPADI meter validation response:", apiResponse);

    if (apiResponse?.status === "success" || apiResponse?.code === "000") {
      return new Response(
        JSON.stringify({ 
          customerName: apiResponse.data?.customer_name || apiResponse.customer_name || `Customer ${meterNumber.slice(-4)}`,
          meterNumber,
          disco: discoCode,
          meterType,
          validated: true,
          address: apiResponse.data?.address || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.error("Meter validation failed:", apiResponse);
      return new Response(
        JSON.stringify({ 
          error: apiResponse?.message || "Invalid meter number or details",
          validated: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error validating meter:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Validation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
