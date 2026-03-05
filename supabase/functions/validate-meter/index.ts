import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map disco codes to SMEPlug format
const discoMapping: Record<string, string> = {
  "ikeja": "ikeja-electric",
  "eko": "eko-electric",
  "abuja": "abuja-electric",
  "kano": "kano-electric",
  "port-harcourt": "portharcourt-electric",
  "ibadan": "ibadan-electric",
  "kaduna": "kaduna-electric",
  "jos": "jos-electric",
  "enugu": "enugu-electric",
  "benin": "benin-electric",
  "yola": "yola-electric",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { disco, meterNumber, meterType } = await req.json();

    const smeplugApiKey = Deno.env.get("SMEPLUG_API_KEY");
    if (!smeplugApiKey) {
      console.error("SMEPLUG_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const discoCode = discoMapping[disco.toLowerCase()] || disco.toLowerCase();
    console.log("Validating meter via SMEPlug:", { disco: discoCode, meterNumber, meterType });

    const response = await fetch("https://smeplug.ng/api/v1/electricity/verify", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${smeplugApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_id: discoCode,
        meter_number: meterNumber,
        meter_type: meterType.toLowerCase(),
      }),
    });

    const apiResponse = await response.json();
    console.log("SMEPlug meter validation response:", apiResponse);

    if (apiResponse?.status === "success" || apiResponse?.success === true) {
      return new Response(
        JSON.stringify({
          customerName: apiResponse.data?.customer_name || apiResponse.data?.name || `Customer ${meterNumber.slice(-4)}`,
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
          validated: false,
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
