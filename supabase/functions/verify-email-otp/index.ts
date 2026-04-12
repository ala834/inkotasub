import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { email, code, purpose } = await req.json() as {
      email: string;
      code: string;
      purpose: "verification" | "login" | "reset_pin";
    };

    const emailLower = email?.trim()?.toLowerCase();
    if (!emailLower) {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get max attempts setting
    const { data: maxAttemptsSetting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "OTP_MAX_ATTEMPTS")
      .single();

    const maxAttempts = parseInt(maxAttemptsSetting?.value || "3");

    // Find valid OTP by email
    const { data: otpRecord, error: findError } = await supabaseAdmin
      .from("otp_codes")
      .select("*")
      .eq("email", emailLower)
      .eq("purpose", purpose)
      .eq("is_verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (findError || !otpRecord) {
      await supabaseAdmin.from("auth_events").insert({
        event_type: "email_otp_verification_failed",
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
        user_agent: req.headers.get("user-agent"),
        metadata: { email: emailLower, purpose, reason: "no_valid_otp" },
      });

      return new Response(
        JSON.stringify({ success: false, error: "OTP expired or not found. Please request a new one." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check attempts
    if (otpRecord.attempts >= maxAttempts) {
      return new Response(
        JSON.stringify({ success: false, error: "Too many failed attempts. Please request a new OTP." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify code
    if (otpRecord.code !== code) {
      await supabaseAdmin
        .from("otp_codes")
        .update({ attempts: otpRecord.attempts + 1 })
        .eq("id", otpRecord.id);

      const remainingAttempts = maxAttempts - otpRecord.attempts - 1;

      await supabaseAdmin.from("auth_events").insert({
        event_type: "email_otp_verification_failed",
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
        user_agent: req.headers.get("user-agent"),
        metadata: { email: emailLower, purpose, reason: "invalid_code", remaining_attempts: remainingAttempts },
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? "s" : ""} remaining.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark OTP as verified
    await supabaseAdmin
      .from("otp_codes")
      .update({ is_verified: true })
      .eq("id", otpRecord.id);

    // Log successful verification
    await supabaseAdmin.from("auth_events").insert({
      event_type: "email_otp_verified",
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      user_agent: req.headers.get("user-agent"),
      metadata: { email: emailLower, purpose },
    });

    // Generate verification token
    const verificationToken = crypto.randomUUID();
    const tokenPurpose = purpose === "reset_pin" ? "reset_pin_token" : "email_verification_token";

    await supabaseAdmin.from("otp_codes").insert({
      email: emailLower,
      phone_number: emailLower,
      code: verificationToken,
      purpose: tokenPurpose,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    console.log(`[EMAIL OTP] Verified for ${emailLower}, purpose: ${purpose}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email verified successfully",
        verification_token: verificationToken,
        email: emailLower,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Verify email OTP error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
