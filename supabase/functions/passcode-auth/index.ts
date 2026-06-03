// Manages 6-digit passcode auth lifecycle:
//   - check_lock: returns whether email is locked from logging in
//   - record_failure: increments failed attempts, applies 30m lock after 5 fails
//   - record_success: clears lockout counters
//   - reset_passcode: verifies email OTP token, sets new passcode, marks passcode_set=true
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 30;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json();
    const action = body.action as string;
    const emailLower = (body.email || "").trim().toLowerCase();

    if (!action) return json({ success: false, error: "action required" }, 400);
    if (!emailLower) return json({ success: false, error: "email required" }, 400);

    // Look up the auth user by email
    const { data: usersList } = await admin.auth.admin.listUsers();
    const matchedUser = usersList?.users?.find((u) => u.email?.toLowerCase() === emailLower);

    if (action === "check_lock") {
      if (!matchedUser) return json({ success: true, locked: false });
      const { data: profile } = await admin
        .from("profiles")
        .select("login_locked_until, failed_login_attempts, passcode_set")
        .eq("user_id", matchedUser.id)
        .single();
      const lockedUntil = profile?.login_locked_until ? new Date(profile.login_locked_until) : null;
      const isLocked = lockedUntil ? lockedUntil > new Date() : false;
      return json({
        success: true,
        locked: isLocked,
        locked_until: isLocked ? lockedUntil!.toISOString() : null,
        passcode_set: !!profile?.passcode_set,
      });
    }

    if (action === "record_failure") {
      // Rate-limit by email and IP to prevent attackers from locking arbitrary accounts.
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const emailRl = checkRateLimit(emailLower, "passcode-auth:record_failure:email", { maxRequests: 6, windowMs: 10 * 60_000 });
      if (!emailRl.allowed) return rateLimitResponse(emailRl.retryAfterMs!, corsHeaders);
      const ipRl = checkRateLimit(ip, "passcode-auth:record_failure:ip", { maxRequests: 30, windowMs: 10 * 60_000 });
      if (!ipRl.allowed) return rateLimitResponse(ipRl.retryAfterMs!, corsHeaders);
      if (!matchedUser) return json({ success: true });
      const { data: profile } = await admin
        .from("profiles")
        .select("failed_login_attempts")
        .eq("user_id", matchedUser.id)
        .single();
      const attempts = (profile?.failed_login_attempts ?? 0) + 1;
      const update: Record<string, unknown> = { failed_login_attempts: attempts };
      let locked_until: string | null = null;
      if (attempts >= MAX_ATTEMPTS) {
        locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
        update.login_locked_until = locked_until;
        update.failed_login_attempts = 0;
      }
      await admin.from("profiles").update(update).eq("user_id", matchedUser.id);
      await admin.from("auth_events").insert({
        event_type: "passcode_login_failed",
        user_id: matchedUser.id,
        ip_address: req.headers.get("x-forwarded-for"),
        metadata: { attempts, locked_until },
      });
      return json({
        success: true,
        attempts,
        remaining: Math.max(0, MAX_ATTEMPTS - attempts),
        locked_until,
      });
    }

    if (action === "record_success") {
      if (!matchedUser) return json({ success: true });
      await admin
        .from("profiles")
        .update({ failed_login_attempts: 0, login_locked_until: null })
        .eq("user_id", matchedUser.id);
      return json({ success: true });
    }

    if (action === "reset_passcode") {
      const { verification_token, new_passcode } = body;
      if (!verification_token) return json({ success: false, error: "verification_token required" }, 400);
      if (!/^\d{4,6}$/.test(new_passcode || ""))
        return json({ success: false, error: "Passcode must be 4 to 6 digits" }, 400);
      if (!matchedUser) return json({ success: false, error: "Account not found" }, 404);

      // Validate token (issued by verify-email-otp for purpose=reset_passcode → token purpose=reset_passcode_token)
      const { data: token } = await admin
        .from("otp_codes")
        .select("*")
        .eq("email", emailLower)
        .eq("code", verification_token)
        .eq("purpose", "reset_passcode_token")
        .eq("is_verified", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!token) return json({ success: false, error: "Invalid or expired verification. Please verify your email again." }, 400);

      await admin.from("otp_codes").update({ is_verified: true }).eq("id", token.id);

      // Wrap PIN with the same prefix used by the client (src/lib/passcode.ts).
      // Keep these in sync — Supabase Auth requires ≥6 char passwords.
      const wrappedPasscode = `inkpin_v1_${new_passcode}`;
      const { error: updateErr } = await admin.auth.admin.updateUserById(matchedUser.id, {
        password: wrappedPasscode,
        email_confirm: true,
      });
      if (updateErr) return json({ success: false, error: updateErr.message }, 500);

      await admin
        .from("profiles")
        .update({
          passcode_set: true,
          email_verified: true,
          failed_login_attempts: 0,
          login_locked_until: null,
        })
        .eq("user_id", matchedUser.id);

      await admin.from("auth_events").insert({
        event_type: "passcode_reset",
        user_id: matchedUser.id,
        ip_address: req.headers.get("x-forwarded-for"),
        metadata: { email: emailLower },
      });

      return json({ success: true });
    }

    return json({ success: false, error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("passcode-auth error:", err);
    return json({ success: false, error: err?.message || "Internal error" }, 500);
  }
});
