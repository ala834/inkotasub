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
    const { provider } = await req.json();

    const plans = getPlans(provider);

    return new Response(
      JSON.stringify({ plans }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getPlans(provider: string) {
  if (provider === "dstv") {
    return [
      { id: "padi", name: "DStv Padi", amount: 2500 },
      { id: "yanga", name: "DStv Yanga", amount: 3500 },
      { id: "confam", name: "DStv Confam", amount: 6200 },
      { id: "compact", name: "DStv Compact", amount: 10500 },
      { id: "compact_plus", name: "DStv Compact Plus", amount: 16600 },
      { id: "premium", name: "DStv Premium", amount: 24500 },
    ];
  } else if (provider === "gotv") {
    return [
      { id: "smallie", name: "GOtv Smallie", amount: 1100 },
      { id: "jinja", name: "GOtv Jinja", amount: 2250 },
      { id: "jolli", name: "GOtv Jolli", amount: 3300 },
      { id: "max", name: "GOtv Max", amount: 4850 },
      { id: "supa", name: "GOtv Supa", amount: 6400 },
    ];
  } else {
    return [
      { id: "nova", name: "StarTimes Nova", amount: 1200 },
      { id: "basic", name: "StarTimes Basic", amount: 2000 },
      { id: "smart", name: "StarTimes Smart", amount: 2800 },
      { id: "classic", name: "StarTimes Classic", amount: 3000 },
      { id: "super", name: "StarTimes Super", amount: 5500 },
    ];
  }
}
