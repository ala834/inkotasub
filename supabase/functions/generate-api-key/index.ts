import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateApiKey, hashApiKey } from "../_shared/api-key-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { name } = await req.json();
    if (!name || typeof name !== "string" || name.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid key name" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify user has approved API access
    const { data: accessReq } = await adminSupabase
      .from("api_access_requests")
      .select("status")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .maybeSingle();
    if (!accessReq) {
      return new Response(JSON.stringify({ error: "API access not approved. Please request access first." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Limit: max 5 active keys per user
    const { count } = await adminSupabase.from("api_keys").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("is_revoked", false);
    if ((count ?? 0) >= 5) {
      return new Response(JSON.stringify({ error: "Maximum of 5 active keys reached. Revoke an existing key first." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { fullKey, prefix } = generateApiKey();
    const keyHash = await hashApiKey(fullKey);

    const { data: inserted, error: insertError } = await adminSupabase
      .from("api_keys")
      .insert({ user_id: user.id, name, key_prefix: prefix, key_hash: keyHash })
      .select()
      .single();
    if (insertError) throw insertError;

    // Ensure API wallet exists
    await adminSupabase.from("api_wallets").upsert({ user_id: user.id, balance: 0 }, { onConflict: "user_id", ignoreDuplicates: true });

    return new Response(
      JSON.stringify({
        success: true,
        key: fullKey, // shown ONCE
        id: inserted.id,
        prefix,
        name,
        message: "Save this key now. You will not be able to see it again.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-api-key error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
