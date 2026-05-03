import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailWithTestMode } from "../_shared/email-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${local[1]}${"*".repeat(Math.min(local.length - 2, 4))}@${domain}`;
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

    const { email, purpose } = await req.json() as {
      email: string;
      purpose: "verification" | "login" | "reset_pin" | "signup";
    };

    // Validate email
    const emailLower = email?.trim()?.toLowerCase();
    if (!emailLower || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      return new Response(
        JSON.stringify({ success: false, error: "Please enter a valid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For signup verification (link-flow), block if email already exists.
    // For "signup" purpose (post-signup OTP), the user has just been created, so skip this check.
    if (purpose === "verification") {
      const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
      const emailExists = existingUser?.users?.some(
        (u) => u.email?.toLowerCase() === emailLower
      );
      if (emailExists) {
        return new Response(
          JSON.stringify({ success: false, error: "This email is already registered. Please login instead." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Rate limiting: max 3 OTPs per email per 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentOTPs } = await supabaseAdmin
      .from("otp_codes")
      .select("id")
      .eq("email", emailLower)
      .gte("created_at", fiveMinutesAgo);

    if (recentOTPs && recentOTPs.length >= 3) {
      return new Response(
        JSON.stringify({ success: false, error: "Too many OTP requests. Please wait 5 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get OTP expiry setting
    const { data: expirySetting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "OTP_EXPIRY_MINUTES")
      .single();

    const expiryMinutes = parseInt(expirySetting?.value || "5");
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    const otpCode = generateOTP();

    // Customize email content based on purpose
    const isPinChange = purpose === "reset_pin";
    const emailSubject = isPinChange
      ? "Transaction PIN Change OTP - INKOTA SUB"
      : "Verify your INKOTA SUB account";
    const emailHeading = isPinChange
      ? "Change Transaction PIN"
      : "Verify your email";
    const emailBody = isPinChange
      ? `Use the code below to verify your identity before changing your transaction PIN. This code expires in ${expiryMinutes} minutes.`
      : `Use the code below to verify your INKOTA SUB account. This code expires in ${expiryMinutes} minutes.`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 30px 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a1a2e; font-size: 24px; margin: 0;">
            INKOTA<span style="color: #6366f1;">SUB</span>
          </h1>
        </div>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 30px; text-align: center;">
          <h2 style="color: #333; font-size: 18px; margin: 0 0 10px;">${emailHeading}</h2>
          <p style="color: #666; font-size: 14px; margin: 0 0 24px;">
            ${emailBody}
          </p>
          <div style="background: #fff; border: 2px solid #e5e7eb; border-radius: 8px; padding: 16px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e; font-family: monospace;">
            ${otpCode}
          </div>
          <p style="color: #999; font-size: 12px; margin: 24px 0 0;">
            If you didn't request this code, please ignore this email.
          </p>
        </div>
        <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 20px;">
          &copy; ${new Date().getFullYear()} INKOTA SUB LTD. All rights reserved.
        </p>
      </div>
    `;

    // Send email using shared sender (with test mode support)
    const emailResult = await sendEmailWithTestMode({
      to: emailLower,
      subject: emailSubject,
      html: htmlContent,
    });

    if (!emailResult.success) {
      console.error("Email send failed:", emailResult.error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send verification email. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (emailResult.testMode) {
      console.log(`[EMAIL OTP - TEST MODE] OTP for ${maskEmail(emailLower)}: ${otpCode}`);
    }

    // Store OTP in database
    const { error: insertError } = await supabaseAdmin.from("otp_codes").insert({
      email: emailLower,
      phone_number: emailLower,
      code: otpCode,
      purpose,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("Error storing OTP:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate OTP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log auth event
    await supabaseAdmin.from("auth_events").insert({
      event_type: "email_otp_sent",
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      user_agent: req.headers.get("user-agent"),
      metadata: { email: maskEmail(emailLower), purpose, test_mode: emailResult.testMode || false },
    });

    console.log(`[EMAIL OTP] Sent to ${maskEmail(emailLower)}, purpose: ${purpose}, testMode: ${emailResult.testMode || false}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Verification code sent to ${maskEmail(emailLower)}`,
        masked_email: maskEmail(emailLower),
        expires_in: expiryMinutes * 60,
        test_mode: emailResult.testMode || false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send email OTP error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});