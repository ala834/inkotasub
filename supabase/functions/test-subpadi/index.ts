import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Test wallet/balance endpoint
    try {
      const res = await fetch("https://subpadi.com/api/v1/balance/", {
        method: "GET",
        headers,
      });
      const data = await res.json();
      results.balance = { status: res.status, ok: res.ok, data };
    } catch (e) {
      results.balance = { status: 0, ok: false, error: e instanceof Error ? e.message : "Failed" };
    }

    // Test data plans endpoint (MTN = network 1)
    try {
      const res = await fetch("https://subpadi.com/api/v1/data/plans?network_id=1", {
        method: "GET",
        headers,
      });
      const data = await res.json();
      const planCount = Array.isArray(data?.data) ? data.data.length
        : (typeof data?.data === 'object' ? Object.values(data.data).flat().length : 0);
      results.data_plans = { status: res.status, ok: res.ok, plan_count: planCount };
    } catch (e) {
      results.data_plans = { status: 0, ok: false, error: e instanceof Error ? e.message : "Failed" };
    }

    // Test cable plans endpoint
    try {
      const res = await fetch("https://subpadi.com/api/v1/cable/plans?service_id=dstv", {
        method: "GET",
        headers,
      });
      const data = await res.json();
      const planCount = Array.isArray(data?.data) ? data.data.length : 0;
      results.cable_plans = { status: res.status, ok: res.ok, plan_count: planCount };
    } catch (e) {
      results.cable_plans = { status: 0, ok: false, error: e instanceof Error ? e.message : "Failed" };
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
