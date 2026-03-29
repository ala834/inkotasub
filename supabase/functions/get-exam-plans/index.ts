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
    // Exam plans are embedded in the Subpadi GET /api/user/ response
    // under the "Exam" key. Fetch from there for live pricing.
    const subpadiToken = Deno.env.get("SUBPADI_API_TOKEN");
    if (subpadiToken) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch("https://subpadi.com/api/user/", {
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
          const examPlans = data?.Exam;

          if (examPlans && Array.isArray(examPlans) && examPlans.length > 0) {
            console.log("Subpadi exam plans from /api/user/:", JSON.stringify(examPlans));
            const plans = examPlans.map((exam: any) => ({
              id: exam.exam_name?.toLowerCase() || exam.id?.toString(),
              name: exam.exam_name || exam.name,
              slug: exam.exam_name?.toLowerCase() || exam.slug,
              amount: parseFloat(exam.amount || exam.price || 0),
              description: getExamDescription(exam.exam_name),
            }));

            return new Response(
              JSON.stringify({ success: true, plans, source: "subpadi" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          console.warn("Subpadi user API returned:", response.status);
        }
      } catch (apiError) {
        console.error("Subpadi exam fetch error:", apiError);
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

function getExamDescription(examName: string): string {
  const descriptions: Record<string, string> = {
    "WAEC": "West African Examination Council",
    "NECO": "National Examination Council",
    "NABTEB": "National Business & Technical Examinations Board",
  };
  return descriptions[examName?.toUpperCase()] || "";
}
