import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { subpadiValidateSmartcard } from "../_shared/subpadi-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map cable provider to Subpadi numeric IDs
const cableIdMapping: Record<string, number> = {
  "dstv": 1, "gotv": 2, "startimes": 3,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, smartCardNumber } = await req.json();

    const cableId = cableIdMapping[provider.toLowerCase()];
    if (!cableId) {
      return new Response(
        JSON.stringify({ error: "Invalid cable provider", validated: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Validating smartcard via Subpadi:", { provider, smartCardNumber });

    const result = await subpadiValidateSmartcard(smartCardNumber, cableId);

    if (result.success) {
      const data = result.rawResponse as any;
      return new Response(
        JSON.stringify({
          customerName: data?.data?.Customer_Name || data?.data?.customer_name || data?.data?.name || data?.Customer_Name || `Customer ${smartCardNumber.slice(-4)}`,
          smartCardNumber,
          provider: provider.toUpperCase(),
          validated: true,
          currentBouquet: data?.data?.Current_Bouquet || data?.data?.current_bouquet || data?.data?.current_plan || null,
          dueDate: data?.data?.Due_Date || data?.data?.due_date || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({
          error: result.message || "Invalid smart card number",
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
