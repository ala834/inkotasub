import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { subpadiValidateSmartcard } from "../_shared/subpadi-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const cableIdMapping: Record<string, number> = {
  "dstv": 1, "gotv": 2, "startimes": 3,
};

function respond(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, smartCardNumber } = await req.json();

    if (!provider || !smartCardNumber) {
      return respond({ error: "Provider and smart card number are required", validated: false });
    }

    const cableId = cableIdMapping[provider.toLowerCase()];
    if (!cableId) {
      return respond({ error: "Invalid cable provider", validated: false });
    }

    console.log("Validating smartcard via Subpadi:", { provider, smartCardNumber });

    const result = await subpadiValidateSmartcard(smartCardNumber, cableId);

    if (result.success) {
      const data = result.rawResponse as any;
      const customerName = data?.data?.Customer_Name || data?.data?.customer_name || data?.data?.name || data?.Customer_Name || null;

      if (!customerName) {
        return respond({
          error: "Could not retrieve customer information. Please check the smart card number and try again.",
          validated: false,
        });
      }

      return respond({
        customerName,
        smartCardNumber,
        provider: provider.toUpperCase(),
        validated: true,
        currentBouquet: data?.data?.Current_Bouquet || data?.data?.current_bouquet || data?.data?.current_plan || null,
        dueDate: data?.data?.Due_Date || data?.data?.due_date || null,
      });
    } else {
      return respond({
        error: result.message || "Invalid smart card number. Please check and try again.",
        validated: false,
      });
    }
  } catch (error: unknown) {
    console.error("Error validating smartcard:", error);
    return respond({
      error: "Smart card validation service is temporarily unavailable. Please try again.",
      validated: false,
    });
  }
});
