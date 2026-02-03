import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SMEPlugService {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  description?: string;
}

interface SMEPlugResponse {
  status: string;
  message?: string;
  data?: SMEPlugService[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("SMEPLUG_API_KEY");

    if (!apiKey) {
      console.error("SMEPLUG_API_KEY not configured");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "SMEPlug API not configured",
          services: [] 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch available services from SMEPlug
    console.log("Fetching SMEPlug services...");
    
    // Try multiple endpoints to get services
    const endpoints = [
      "https://smeplug.ng/api/v1/services",
      "https://smeplug.ng/api/v1/user",
    ];

    let services: SMEPlugService[] = [];
    let apiError: string | null = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
        });

        const data = await response.json();
        console.log(`SMEPlug ${endpoint} response:`, JSON.stringify(data));

        if (response.ok && data?.data) {
          if (Array.isArray(data.data)) {
            services = data.data;
            break;
          }
        }
      } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        apiError = error instanceof Error ? error.message : "Unknown error";
      }
    }

    // If no services from API, return the known SMEPlug services
    if (services.length === 0) {
      // SMEPlug known services based on their API documentation
      services = [
        { id: 1, name: "Airtime", slug: "airtime", is_active: true, description: "Purchase airtime for all networks" },
        { id: 2, name: "Data Bundle", slug: "data", is_active: true, description: "Buy data bundles for MTN, Glo, Airtel, 9mobile" },
        { id: 3, name: "Electricity", slug: "electricity", is_active: true, description: "Pay electricity bills" },
        { id: 4, name: "Cable TV", slug: "cable", is_active: true, description: "Subscribe to DSTV, GOtv, Startimes" },
        { id: 5, name: "Airtime to Cash", slug: "airtime-to-cash", is_active: false, description: "Convert airtime to cash" },
      ];
      console.log("Using default SMEPlug services list");
    }

    // Filter active services
    const activeServices = services.filter(s => s.is_active !== false);

    if (activeServices.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No services available from provider",
          services: [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        services: activeServices,
        provider: "smeplug",
        api_error: apiError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Get SMEPlug services error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Internal server error",
        services: [] 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
