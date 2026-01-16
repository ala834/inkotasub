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

    const subpadiApiKey = Deno.env.get("SUBPADI_API_KEY");
    const subpadiToken = Deno.env.get("SUBPADI_API_TOKEN");

    if (!subpadiApiKey || !subpadiToken) {
      console.error("SUBPADI credentials not configured");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map provider to SUBPADI format
    const providerMapping: Record<string, string> = {
      "dstv": "DSTV",
      "gotv": "GOTV",
      "startimes": "STARTIMES",
    };

    const providerCode = providerMapping[provider.toLowerCase()] || provider.toUpperCase();

    console.log("Validating smartcard:", { provider: providerCode, smartCardNumber });

    // Call SUBPADI smartcard validation API
    const response = await fetch("https://subpadi.com/api/cable/verify", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${subpadiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: subpadiApiKey,
        provider: providerCode,
        smartcard_number: smartCardNumber,
      }),
    });

    const apiResponse = await response.json();
    console.log("SUBPADI smartcard validation response:", apiResponse);

    if (apiResponse?.status === "success" || apiResponse?.code === "000") {
      return new Response(
        JSON.stringify({ 
          customerName: apiResponse.data?.customer_name || apiResponse.customer_name || `Customer ${smartCardNumber.slice(-4)}`,
          smartCardNumber,
          provider: providerCode,
          validated: true,
          currentBouquet: apiResponse.data?.current_bouquet || null,
          dueDate: apiResponse.data?.due_date || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.error("Smartcard validation failed:", apiResponse);
      return new Response(
        JSON.stringify({ 
          error: apiResponse?.message || "Invalid smart card number",
          validated: false 
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
