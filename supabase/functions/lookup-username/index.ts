// Resolves a login identifier (username, email, or Nigerian phone number) to the
// account's email address. Used by the passcode login flow.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Normalize Nigerian phone to local 0XXXXXXXXXX format
function normalizeNigerianPhoneLocal(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  if (/^0\d{10}$/.test(digits)) return digits;
  if (/^234\d{10}$/.test(digits)) return "0" + digits.slice(3);
  if (/^\d{10}$/.test(digits)) return "0" + digits;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    // Accept either { username } (legacy) or { identifier }
    const raw = (body.identifier ?? body.username ?? "").toString().trim();
    if (!raw) return json({ success: false, error: "Identifier required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Email — return as-is if it exists in auth
    if (raw.includes("@")) {
      const emailLower = raw.toLowerCase();
      const { data: list } = await admin.auth.admin.listUsers();
      const match = list?.users?.find((u) => u.email?.toLowerCase() === emailLower);
      if (!match) return json({ success: false, error: "Account not found" }, 404);
      return json({ success: true, email: match.email });
    }

    // 2) Phone number lookup
    const phoneLocal = normalizeNigerianPhoneLocal(raw);
    if (phoneLocal) {
      const { data: profile } = await admin
        .from("profiles")
        .select("user_id")
        .eq("phone_number", phoneLocal)
        .maybeSingle();
      if (!profile) return json({ success: false, error: "Phone not registered" }, 404);
      const { data: authUser } = await admin.auth.admin.getUserById(profile.user_id);
      if (!authUser?.user?.email) return json({ success: false, error: "Account not found" }, 404);
      return json({ success: true, email: authUser.user.email });
    }

    // 3) Username
    if (raw.length < 4) return json({ success: false, error: "Invalid identifier" }, 400);
    const normalizedUsername = raw.toLowerCase();
    const { data: profile } = await admin
      .from("profiles")
      .select("user_id")
      .eq("username", normalizedUsername)
      .maybeSingle();
    if (!profile) return json({ success: false, error: "Username not found" }, 404);
    const { data: authUser } = await admin.auth.admin.getUserById(profile.user_id);
    if (!authUser?.user?.email) return json({ success: false, error: "Account not found" }, 404);
    return json({ success: true, email: authUser.user.email });
  } catch (err) {
    console.error("lookup-username error:", err);
    return json({ success: false, error: "Server error" }, 500);
  }
});
