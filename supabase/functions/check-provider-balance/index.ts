import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { subpadiGetUserBalance, isSubpadiConfigured } from "../_shared/subpadi-provider.ts";
import { smeplugGetBalance, isSmeplugConfigured } from "../_shared/smeplug-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Admin check
    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: hasAdmin } = await adminSupabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const providers: Record<string, any> = {};

    // Check Subpadi
    if (isSubpadiConfigured()) {
      const subpadi = await subpadiGetUserBalance();
      providers.subpadi = {
        configured: true,
        connected: subpadi.success,
        balance: subpadi.success ? (subpadi.rawResponse as any)?.balance ?? (subpadi.rawResponse as any)?.wallet_balance : null,
        details: subpadi.rawResponse,
      };
    } else {
      providers.subpadi = { configured: false, connected: false, balance: null };
    }

    // Check SMEPlug
    if (isSmeplugConfigured()) {
      const smeplug = await smeplugGetBalance();
      providers.smeplug = {
        configured: true,
        connected: smeplug.success,
        balance: smeplug.success ? (smeplug.rawResponse as any)?.balance ?? (smeplug.rawResponse as any)?.data?.balance : null,
        details: smeplug.rawResponse,
      };
    } else {
      providers.smeplug = { configured: false, connected: false, balance: null };
    }

    return new Response(JSON.stringify({ success: true, providers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
