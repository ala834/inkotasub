import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    // Fetch from Subpadi
    const subpadiToken = Deno.env.get("SUBPADI_API_TOKEN");
    if (subpadiToken) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch("https://subpadi.com/api/v1/exam/", {
          method: "GET",
          headers: {
            "Authorization": `Token ${subpadiToken}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

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
