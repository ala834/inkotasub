import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VerifyOTPRequest {
  phoneNumber: string;
  code: string;
  purpose: "verification" | "login" | "reset_pin";
}

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

    const { phoneNumber, code, purpose }: VerifyOTPRequest = await req.json();

    // Format phone number
    let formattedPhone = phoneNumber.replace(/[^\d+]/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "+234" + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith("234")) {
      formattedPhone = "+" + formattedPhone;
    } else if (!formattedPhone.startsWith("+234")) {
      formattedPhone = "+234" + formattedPhone;
    }

    // Get max attempts setting
    const { data: maxAttemptsSetting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "OTP_MAX_ATTEMPTS")
      .single();

    const maxAttempts = parseInt(maxAttemptsSetting?.value || "3");

    // Find valid OTP
    const { data: otpRecord, error: findError } = await supabaseAdmin
      .from("otp_codes")
      .select("*")
      .eq("phone_number", formattedPhone)
      .eq("purpose", purpose)
      .eq("is_verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (findError || !otpRecord) {
      // Log failed attempt
      await supabaseAdmin.from("auth_events").insert({
        phone_number: formattedPhone,
        event_type: "otp_verification_failed",
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
        user_agent: req.headers.get("user-agent"),
        metadata: { purpose, reason: "no_valid_otp" },
      });

      return new Response(
        JSON.stringify({ success: false, error: "OTP expired or not found. Please request a new one." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check attempts
    if (otpRecord.attempts >= maxAttempts) {
      return new Response(
        JSON.stringify({ success: false, error: "Too many failed attempts. Please request a new OTP." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify code
    if (otpRecord.code !== code) {
      // Increment attempts
      await supabaseAdmin
        .from("otp_codes")
        .update({ attempts: otpRecord.attempts + 1 })
        .eq("id", otpRecord.id);

      const remainingAttempts = maxAttempts - otpRecord.attempts - 1;

      // Log failed attempt
      await supabaseAdmin.from("auth_events").insert({
        phone_number: formattedPhone,
        event_type: "otp_verification_failed",
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
        user_agent: req.headers.get("user-agent"),
        metadata: { purpose, reason: "invalid_code", remaining_attempts: remainingAttempts },
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark OTP as verified
    await supabaseAdmin
      .from("otp_codes")
      .update({ is_verified: true })
      .eq("id", otpRecord.id);

    // Log successful verification
    await supabaseAdmin.from("auth_events").insert({
      phone_number: formattedPhone,
      event_type: "otp_verified",
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      user_agent: req.headers.get("user-agent"),
      metadata: { purpose },
    });

    // Generate a temporary verification token for the next step
    const verificationToken = crypto.randomUUID();

    // Determine the token purpose based on the original purpose
    const tokenPurpose = purpose === "reset_pin" ? "reset_pin_token" : "verification_token";

    // Store token temporarily (expires in 10 minutes)
    const { error: tokenInsertError } = await supabaseAdmin.from("otp_codes").insert({
      phone_number: formattedPhone,
      code: verificationToken,
      purpose: tokenPurpose,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    if (tokenInsertError) {
      console.error("Error storing verification token:", tokenInsertError);
    }

    console.log(`[OTP] Verification successful for ${formattedPhone}, purpose: ${purpose}, token purpose: ${tokenPurpose}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "OTP verified successfully",
        verification_token: verificationToken,
        phone_number: formattedPhone,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Verify OTP error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
