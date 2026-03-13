import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_EXAM_PLANS = [
  { id: "waec", name: "WAEC", slug: "waec", amount: 3450, description: "West African Examination Council" },
  { id: "neco", name: "NECO", slug: "neco", amount: 1450, description: "National Examination Council" },
  { id: "nabteb", name: "NABTEB", slug: "nabteb", amount: 1450, description: "National Business & Technical Examinations Board" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Try Subpadi first
    const subpadiToken = Deno.env.get("SUBPADI_API_TOKEN");
    if (subpadiToken) {
      try {
        const response = await fetch("https://subpadi.com/api/v1/exam/", {
          method: "GET",
          headers: {
            "Authorization": `Token ${subpadiToken}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log("Subpadi exam plans response:", data);

          const plansArray = data?.data || data?.results || (Array.isArray(data) ? data : null);
          if (plansArray && Array.isArray(plansArray) && plansArray.length > 0) {
            const plans = plansArray.map((exam: any) => ({
              id: exam.slug || exam.exam_type || exam.id?.toString() || exam.name?.toLowerCase(),
              name: exam.name || exam.exam_type?.toUpperCase(),
              slug: exam.slug || exam.exam_type || exam.name?.toLowerCase(),
              amount: parseFloat(exam.amount || exam.price || exam.selling_price || 0),
              description: exam.description || "",
            }));

            return new Response(
              JSON.stringify({ success: true, plans, source: "subpadi" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          console.warn("Subpadi exam API returned:", response.status);
        }
      } catch (apiError) {
        console.error("Subpadi exam API error:", apiError);
      }
    }

    // Fallback to SMEPlug
    const smeplugApiKey = Deno.env.get("SMEPLUG_API_KEY");
    if (smeplugApiKey) {
      try {
        const response = await fetch("https://smeplug.ng/api/v1/education/exam", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${smeplugApiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log("SMEPlug exam plans response:", data);

          if (data?.data && Array.isArray(data.data)) {
            const plans = data.data.map((exam: any) => ({
              id: exam.slug || exam.id?.toString() || exam.name?.toLowerCase(),
              name: exam.name,
              slug: exam.slug || exam.name?.toLowerCase(),
              amount: parseFloat(exam.amount || exam.price || 0),
              description: exam.description || "",
            }));

            return new Response(
              JSON.stringify({ success: true, plans, source: "smeplug" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      } catch (apiError) {
        console.error("SMEPlug exam API error:", apiError);
      }
    }

    // Fallback to defaults
    return new Response(
      JSON.stringify({ success: true, plans: DEFAULT_EXAM_PLANS, source: "default" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in get-exam-plans:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to fetch exam plans", plans: DEFAULT_EXAM_PLANS }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
