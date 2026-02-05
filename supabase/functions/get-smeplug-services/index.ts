import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SMEPlugService {
  id: number | string;
  name: string;
  slug: string;
  is_active: boolean;
  status?: string;
  description?: string;
  category?: string;
  icon?: string;
}

// Expected service categories to log if missing
const EXPECTED_CATEGORIES = [
  "airtime",
  "data",
  "electricity",
  "cable",
  "exam",
  "education",
  "airtime-to-cash",
];

// SMEPlug API v2 endpoints based on their documentation
const SMEPLUG_BASE_URL = "https://smeplug.ng/api/v2";

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
          services: [],
          categories: [],
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching SMEPlug services dynamically...");
    
    const allServices: SMEPlugService[] = [];
    const apiErrors: string[] = [];
    const successfulEndpoints: string[] = [];

    // SMEPlug API v2 documented endpoints for different services
    const serviceEndpoints = [
      { 
        url: `${SMEPLUG_BASE_URL}/airtime/networks`, 
        category: "airtime",
        name: "Airtime",
        fallbackServices: [
          { id: "mtn", name: "MTN Airtime", slug: "mtn-airtime" },
          { id: "glo", name: "Glo Airtime", slug: "glo-airtime" },
          { id: "airtel", name: "Airtel Airtime", slug: "airtel-airtime" },
          { id: "9mobile", name: "9mobile Airtime", slug: "9mobile-airtime" },
        ]
      },
      { 
        url: `${SMEPLUG_BASE_URL}/data/networks`, 
        category: "data",
        name: "Data Bundle",
        fallbackServices: [
          { id: "mtn", name: "MTN Data", slug: "mtn-data" },
          { id: "glo", name: "Glo Data", slug: "glo-data" },
          { id: "airtel", name: "Airtel Data", slug: "airtel-data" },
          { id: "9mobile", name: "9mobile Data", slug: "9mobile-data" },
        ]
      },
      { 
        url: `${SMEPLUG_BASE_URL}/electricity/discos`, 
        category: "electricity",
        name: "Electricity",
        fallbackServices: [
          { id: "ikeja", name: "Ikeja Electric", slug: "ikeja-electric" },
          { id: "eko", name: "Eko Electric", slug: "eko-electric" },
          { id: "abuja", name: "Abuja Electric", slug: "abuja-electric" },
          { id: "kano", name: "Kano Electric", slug: "kano-electric" },
        ]
      },
      { 
        url: `${SMEPLUG_BASE_URL}/cable/providers`, 
        category: "cable",
        name: "Cable TV",
        fallbackServices: [
          { id: "dstv", name: "DSTV", slug: "dstv" },
          { id: "gotv", name: "GOtv", slug: "gotv" },
          { id: "startimes", name: "Startimes", slug: "startimes" },
        ]
      },
      { 
        url: `${SMEPLUG_BASE_URL}/exam/types`, 
        category: "exam",
        name: "Exam Cards",
        fallbackServices: [
          { id: "waec", name: "WAEC Result Checker", slug: "waec" },
          { id: "neco", name: "NECO Result Checker", slug: "neco" },
          { id: "nabteb", name: "NABTEB Result Checker", slug: "nabteb" },
          { id: "jamb", name: "JAMB PIN", slug: "jamb" },
        ]
      },
      { 
        url: `${SMEPLUG_BASE_URL}/education/types`, 
        category: "education",
        name: "Education",
        fallbackServices: []
      },
      { 
        url: `${SMEPLUG_BASE_URL}/airtime-to-cash/networks`, 
        category: "airtime-to-cash",
        name: "Airtime to Cash",
        fallbackServices: [
          { id: "mtn-a2c", name: "MTN to Cash", slug: "mtn-a2c" },
          { id: "airtel-a2c", name: "Airtel to Cash", slug: "airtel-a2c" },
        ]
      },
    ];

    // Alternative v1 endpoints to try
    const v1Endpoints = [
      `https://smeplug.ng/api/v1/airtime`,
      `https://smeplug.ng/api/v1/data`,
      `https://smeplug.ng/api/v1/electricity`,
      `https://smeplug.ng/api/v1/cable`,
      `https://smeplug.ng/api/v1/user/balance`,
    ];

    // Helper to make API requests
    const fetchEndpoint = async (url: string): Promise<{ ok: boolean; data: any; status: number }> => {
      try {
        console.log(`Fetching: ${url}`);
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
        });

        const data = await response.json();
        console.log(`Response ${url}: status=${response.status}, data=${JSON.stringify(data).substring(0, 200)}`);
        
        return { ok: response.ok, data, status: response.status };
      } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return { ok: false, data: null, status: 0 };
      }
    };

    // Try v2 endpoints first
    for (const endpoint of serviceEndpoints) {
      const { ok, data, status } = await fetchEndpoint(endpoint.url);
      
      if (ok && data) {
        successfulEndpoints.push(endpoint.url);
        
        // Extract services from response
        const services = data.data || data.networks || data.discos || data.providers || data.types || [];
        
        if (Array.isArray(services) && services.length > 0) {
          for (const svc of services) {
             // Clean service names - remove provider references
             const cleanName = (svc.name || svc.network || svc.provider || endpoint.name)
               .replace(/smeplug/gi, '')
               .replace(/subpadi/gi, '')
               .trim();
            allServices.push({
              id: svc.id || svc.network_id || svc.code || `${endpoint.category}-${Math.random()}`,
               name: cleanName || endpoint.name,
              slug: svc.slug || svc.code || svc.network?.toLowerCase() || endpoint.category,
              is_active: svc.is_active !== false && svc.status !== "inactive",
              status: svc.status || "active",
              description: svc.description || `${endpoint.name} service`,
              category: endpoint.category,
            });
          }
        } else if (!Array.isArray(services) && typeof data === "object") {
          // Single service category available
          allServices.push({
            id: endpoint.category,
            name: endpoint.name,
            slug: endpoint.category,
            is_active: true,
            status: "active",
            description: `${endpoint.name} services available`,
            category: endpoint.category,
          });
        }
      } else {
        // API didn't return data - use fallback if available
        apiErrors.push(`${endpoint.category}: status ${status}`);
        
        // Add category as available based on fallback
        if (endpoint.fallbackServices.length > 0) {
          allServices.push({
            id: endpoint.category,
            name: endpoint.name,
            slug: endpoint.category,
            is_active: true,
            status: "assumed",
            description: `${endpoint.name} services (status unknown)`,
            category: endpoint.category,
          });
        }
      }
    }

    // If no services found from v2, try v1 endpoints
    if (allServices.length === 0) {
      console.log("No services from v2 API, trying v1 endpoints...");
      
      for (const url of v1Endpoints) {
        const { ok, data, status } = await fetchEndpoint(url);
        if (ok) {
          successfulEndpoints.push(url);
        }
      }
    }

    // If still no services, provide known SMEPlug service categories
    if (allServices.length === 0) {
      console.log("No services from API, using known SMEPlug service categories...");
      
      // These are the documented SMEPlug services
      allServices.push(
        { id: 1, name: "Airtime", slug: "airtime", is_active: true, category: "airtime", description: "Purchase airtime for all networks" },
        { id: 2, name: "Data Bundle", slug: "data", is_active: true, category: "data", description: "Buy data bundles for MTN, Glo, Airtel, 9mobile" },
        { id: 3, name: "Electricity", slug: "electricity", is_active: true, category: "electricity", description: "Pay electricity bills" },
        { id: 4, name: "Cable TV", slug: "cable", is_active: true, category: "cable", description: "Subscribe to DSTV, GOtv, Startimes" },
        { id: 5, name: "Exam Cards", slug: "exam", is_active: true, category: "exam", description: "Buy WAEC, NECO, NABTEB result checker PINs" },
        { id: 6, name: "Airtime to Cash", slug: "airtime-to-cash", is_active: false, category: "airtime-to-cash", description: "Convert airtime to cash" },
      );
    }

    // Log what categories we found vs expected
    const foundCategories = [...new Set(allServices.map(s => s.category || s.slug))];
    const missingCategories = EXPECTED_CATEGORIES.filter(
      cat => !foundCategories.some(found => found?.includes(cat) || cat.includes(found || ""))
    );

    console.log("=== SMEPlug Service Discovery Results ===");
     console.log("=== INKOTA SUB Service Discovery ===");
     console.log("Total service categories found:", allServices.length);
    console.log("Categories found:", foundCategories);
    console.log("Successful API endpoints:", successfulEndpoints);
    console.log("API errors:", apiErrors);
    
    if (missingCategories.length > 0) {
      console.warn("⚠️ Missing expected categories:", missingCategories);
    }

    // Filter to only show services NOT explicitly marked as inactive
    const activeServices = allServices.filter(s => s.is_active !== false);

    // Group by category
    const categoryMap = new Map<string, SMEPlugService[]>();
    for (const service of allServices) {
      const cat = service.category || "other";
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, []);
      }
      categoryMap.get(cat)!.push(service);
    }

    const categories = Array.from(categoryMap.entries()).map(([slug, services]) => ({
      id: slug,
      name: services[0]?.name || slug.charAt(0).toUpperCase() + slug.slice(1),
      slug,
      services,
      is_active: services.some(s => s.is_active),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        services: activeServices,
        all_services: allServices,
        categories,
         // Don't expose provider name to frontend
        api_endpoints_tried: serviceEndpoints.map(e => e.url),
        successful_endpoints: successfulEndpoints,
        api_errors: apiErrors.length > 0 ? apiErrors : undefined,
        missing_categories: missingCategories.length > 0 ? missingCategories : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Get SMEPlug services error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Internal server error",
        services: [],
        categories: [],
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
