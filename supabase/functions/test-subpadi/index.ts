import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Attempt ${attempt + 1}/${retries + 1} failed for ${url}:`, lastError.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
      }
    }
  }
  throw lastError || new Error("Request failed after retries");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: role } = await adminSupabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!role) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("SUBPADI_API_TOKEN");
    if (!token) {
      return new Response(
        JSON.stringify({
          connected: false,
          message: "SUBPADI_API_TOKEN is not configured",
          services: {},
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, any> = {};
    const headers = {
      "Authorization": `Token ${token}`,
      "Content-Type": "application/json",
    };

    // Test GET /api/user/ - User details & balance
    try {
      const res = await fetchWithRetry("https://subpadi.com/api/user/", {
        method: "GET",
        headers,
      });
      const data = await res.json();
      console.log("Subpadi user/balance response:", JSON.stringify(data));
      results.balance = { status: res.status, ok: res.ok, data };
    } catch (e) {
      console.error("Subpadi balance test error:", e);
      results.balance = { status: 0, ok: false, error: e instanceof Error ? e.message : "Failed" };
    }

    // Test GET /api/data/ - Data transactions/plans
    try {
      const res = await fetchWithRetry("https://subpadi.com/api/data/", {
        method: "GET",
        headers,
      });
      const data = await res.json();
      console.log("Subpadi data response:", JSON.stringify(data));
      const planCount = Array.isArray(data) ? data.length
        : (Array.isArray(data?.data) ? data.data.length
        : (typeof data?.data === 'object' ? Object.values(data.data).flat().length : 0));
      results.data_plans = { status: res.status, ok: res.ok, plan_count: planCount };
    } catch (e) {
      console.error("Subpadi data test error:", e);
      results.data_plans = { status: 0, ok: false, error: e instanceof Error ? e.message : "Failed" };
    }

    // Test GET /api/cablesub/ - Cable plans
    try {
      const res = await fetchWithRetry("https://subpadi.com/api/cablesub/", {
        method: "GET",
        headers,
      });
      const data = await res.json();
      console.log("Subpadi cable response:", JSON.stringify(data));
      const planCount = Array.isArray(data) ? data.length
        : (Array.isArray(data?.data) ? data.data.length : 0);
      results.cable_plans = { status: res.status, ok: res.ok, plan_count: planCount };
    } catch (e) {
      console.error("Subpadi cable test error:", e);
      results.cable_plans = { status: 0, ok: false, error: e instanceof Error ? e.message : "Failed" };
    }

    // Test GET /api/exam/ - Exam plans
    try {
      const res = await fetchWithRetry("https://subpadi.com/api/exam/", {
        method: "GET",
        headers,
      });
      const data = await res.json();
      console.log("Subpadi exam response:", JSON.stringify(data));
      const plansArray = data?.data || data?.results || (Array.isArray(data) ? data : []);
      const planCount = Array.isArray(plansArray) ? plansArray.length : 0;
      results.exam_plans = { status: res.status, ok: res.ok, plan_count: planCount };
    } catch (e) {
      console.error("Subpadi exam test error:", e);
      results.exam_plans = { status: 0, ok: false, error: e instanceof Error ? e.message : "Failed" };
    }

    const allOk = Object.values(results).every((r: any) => r.ok);

    return new Response(
      JSON.stringify({
        connected: allOk,
        message: allOk ? "Subpadi API is fully connected and operational" : "Some Subpadi endpoints returned errors",
        services: results,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Test Subpadi error:", error);
    return new Response(
      JSON.stringify({ connected: false, message: error instanceof Error ? error.message : "Unknown error", services: {} }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
