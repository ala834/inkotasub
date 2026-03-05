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
    const { provider, smartCardNumber } = await req.json();

    const smeplugApiKey = Deno.env.get("SMEPLUG_API_KEY");
    if (!smeplugApiKey) {
      console.error("SMEPLUG_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const providerCode = provider.toLowerCase();
    console.log("Validating smartcard via SMEPlug:", { provider: providerCode, smartCardNumber });

    const response = await fetch("https://smeplug.ng/api/v1/cable/verify", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${smeplugApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_id: providerCode,
        smartcard_number: smartCardNumber,
      }),
    });

    const apiResponse = await response.json();
    console.log("SMEPlug smartcard validation response:", apiResponse);

    if (apiResponse?.status === "success" || apiResponse?.success === true) {
      return new Response(
        JSON.stringify({
          customerName: apiResponse.data?.customer_name || apiResponse.data?.name || `Customer ${smartCardNumber.slice(-4)}`,
          smartCardNumber,
          provider: providerCode.toUpperCase(),
          validated: true,
          currentBouquet: apiResponse.data?.current_bouquet || apiResponse.data?.current_plan || null,
          dueDate: apiResponse.data?.due_date || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.error("Smartcard validation failed:", apiResponse);
      return new Response(
        JSON.stringify({
          error: apiResponse?.message || "Invalid smart card number",
          validated: false,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error validating smartcard:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Validation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
