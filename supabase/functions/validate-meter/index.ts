import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { subpadiValidateMeter } from "../_shared/subpadi-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map disco codes to Subpadi numeric IDs
const discoIdMapping: Record<string, number> = {
  "ikeja": 1, "eko": 2, "abuja": 3, "kano": 4,
  "port-harcourt": 5, "ibadan": 6, "kaduna": 7,
  "jos": 8, "enugu": 9, "benin": 10, "yola": 11,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { disco, meterNumber, meterType } = await req.json();

    const discoId = discoIdMapping[disco.toLowerCase()];
    if (!discoId) {
      return new Response(
        JSON.stringify({ error: "Invalid distribution company", validated: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mType = meterType.toLowerCase() === "prepaid" ? 1 : 2;
    console.log("Validating meter via Subpadi:", { disco, meterNumber, meterType });

    const result = await subpadiValidateMeter(meterNumber, discoId, mType);

    if (result.success) {
      const data = result.rawResponse as any;
      return new Response(
        JSON.stringify({
          customerName: data?.data?.Customer_Name || data?.data?.customer_name || data?.data?.name || data?.Customer_Name || `Customer ${meterNumber.slice(-4)}`,
          meterNumber,
          disco,
          meterType,
          validated: true,
          address: data?.data?.Address || data?.data?.address || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({
          error: result.message || "Invalid meter number or details",
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
