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

    // The Subpadi API primary endpoint is GET /api/user/
    // It returns: user details, balance, network percentages, exam plans
    // There are NO dedicated plan-listing endpoints - plans come from the Subpadi dashboard
    // Purchase endpoints: POST /api/data/, POST /api/topup/, POST /api/cablesub, POST /api/billpayment/
    // GET on purchase endpoints returns transaction history, NOT available plans

    try {
      const res = await fetchWithRetry("https://subpadi.com/api/user/", {
        method: "GET",
        headers,
      });
      const data = await res.json();
      console.log("Subpadi user response:", JSON.stringify(data));

      if (res.ok && data?.user) {
        const walletBalance = parseFloat(data.user.wallet_balance || data.user.Account_Balance || "0");
        const username = data.user.username || "Unknown";
        const email = data.user.email || "Unknown";
        const userType = data.user.user_type || "Unknown";
        const isVerified = data.user.verify || false;
        const emailVerified = data.user.email_verified || false;

        results.account = {
          status: res.status,
          ok: true,
          username,
          email,
          userType,
          walletBalance,
          isVerified,
          emailVerified,
        };

        // Extract available networks from percentage data
        const networkPercentages = data.percentage || [];
        const networkMap: Record<number, string> = { 1: "MTN", 2: "GLO", 3: "AIRTEL", 4: "9MOBILE" };
        results.data_service = {
          ok: true,
          status: 200,
          networks: networkPercentages.map((p: any) => ({
            id: p.network,
            name: networkMap[p.network] || `Network ${p.network}`,
            discountPercent: p.percent,
          })),
          note: "Data plans are configured on Subpadi dashboard. Plan IDs used in purchase requests.",
        };

        // Extract airtime info
        const topupPercentages = data.topuppercentage || [];
        results.airtime_service = {
          ok: true,
          status: 200,
          networks: topupPercentages.map((p: any) => ({
            id: p.network,
            name: networkMap[p.network] || `Network ${p.network}`,
            discountPercent: p.percent,
          })),
        };

        // Extract exam plans from user response
        const examPlans = data.Exam || [];
        results.exam_service = {
          ok: examPlans.length > 0,
          status: 200,
          plan_count: examPlans.length,
          plans: examPlans.map((e: any) => ({
            name: e.exam_name,
            amount: e.amount,
          })),
        };

        // Cable and electricity are available via purchase endpoints
        results.cable_service = {
          ok: true,
          status: 200,
          note: "Cable plans configured on Subpadi dashboard. Purchase via POST /api/cablesub",
        };

        results.electricity_service = {
          ok: true,
          status: 200,
          note: "Electricity via POST /api/billpayment/. Meter validation via GET /api/validatemeter",
        };
      } else {
        results.account = {
          status: res.status,
          ok: false,
          error: data?.detail || data?.message || "Authentication failed",
        };
      }
    } catch (e) {
      console.error("Subpadi connection test error:", e);
      results.account = { status: 0, ok: false, error: e instanceof Error ? e.message : "Connection failed" };
    }

    const isConnected = results.account?.ok === true;

    return new Response(
      JSON.stringify({
        connected: isConnected,
        message: isConnected
          ? `Connected to Subpadi as ${results.account.username} (Balance: ₦${results.account.walletBalance})`
          : results.account?.error || "Failed to connect to Subpadi API",
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
