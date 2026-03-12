import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendOTPRequest {
  phoneNumber: string;
  purpose: "verification" | "login" | "reset_pin";
}

// Validate Nigerian phone number
function validatePhoneNumber(phone: string): { valid: boolean; formatted: string; error?: string } {
  // Remove all non-numeric characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");
  
  // Handle different formats
  if (cleaned.startsWith("+234")) {
    cleaned = cleaned;
  } else if (cleaned.startsWith("234")) {
    cleaned = "+" + cleaned;
  } else if (cleaned.startsWith("0")) {
    cleaned = "+234" + cleaned.substring(1);
  } else if (cleaned.length === 10) {
    cleaned = "+234" + cleaned;
  } else {
    return { valid: false, formatted: "", error: "Invalid phone number format" };
  }
  
  // Validate length: +234 (4) + 10 digits = 14 characters
  if (cleaned.length !== 14) {
    return { valid: false, formatted: "", error: "Phone number must be 10 digits after country code" };
  }
  
  // Validate prefix (Nigerian mobile prefixes)
  const validPrefixes = ["803", "806", "810", "813", "814", "816", "703", "706", "803", "805", "807", "808", "812", "815", "705", "805", "811", "904", "902", "903", "905", "906", "907", "908", "909", "901"];
  const prefix = cleaned.substring(4, 7);
  
  // Accept any valid mobile prefix for now
  if (!prefix.match(/^[789][01]\d$/)) {
    return { valid: false, formatted: "", error: "Invalid Nigerian mobile number" };
  }
  
  return { valid: true, formatted: cleaned };
}

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Mask phone number for display
function maskPhoneNumber(phone: string): string {
  if (phone.length < 10) return phone;
  return phone.substring(0, 7) + "****" + phone.substring(phone.length - 3);
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

    const { phoneNumber, purpose }: SendOTPRequest = await req.json();

    // Validate phone number
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formattedPhone = validation.formatted;

    // Check rate limiting (max 3 OTPs per phone per 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentOTPs, error: rateLimitError } = await supabaseAdmin
      .from("otp_codes")
      .select("id")
      .eq("phone_number", formattedPhone)
      .gte("created_at", fiveMinutesAgo);

    if (rateLimitError) {
      console.error("Rate limit check error:", rateLimitError);
    }

    if (recentOTPs && recentOTPs.length >= 3) {
      return new Response(
        JSON.stringify({ success: false, error: "Too many OTP requests. Please wait 5 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if Termii is enabled
    const { data: termiiSetting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "TERMII_ENABLED")
      .single();

    const termiiEnabled = termiiSetting?.value === "true";

    // Get OTP expiry setting
    const { data: expirySetting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "OTP_EXPIRY_MINUTES")
      .single();

    const expiryMinutes = parseInt(expirySetting?.value || "5");
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    let otpCode: string;
    let smsSent = false;

    if (termiiEnabled) {
      // Use Termii API (for future use when CAC is ready)
      otpCode = generateOTP();
      
      const termiiApiKey = Deno.env.get("TERMII_API_KEY");
      const termiiSenderId = Deno.env.get("TERMII_SENDER_ID") || "INKOTASUB";

      if (termiiApiKey) {
        try {
          const termiiResponse = await fetch("https://api.ng.termii.com/api/sms/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: termiiApiKey,
              to: formattedPhone,
              from: termiiSenderId,
              sms: `Your INKOTASUB verification code is: ${otpCode}. Valid for ${expiryMinutes} minutes.`,
              type: "plain",
              channel: "generic",
            }),
          });

          const termiiData = await termiiResponse.json();
          smsSent = termiiData.code === "ok" || termiiResponse.ok;
          console.log("Termii response:", termiiData);
        } catch (error) {
          console.error("Termii API error:", error);
          smsSent = false;
        }
      }
    } else {
      // Use mock OTP for testing
      const { data: mockSetting } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "MOCK_OTP_CODE")
        .single();

      otpCode = mockSetting?.value || "123456";
      smsSent = true; // Mock always succeeds
      console.log(`[MOCK OTP] Code for ${maskPhoneNumber(formattedPhone)}: ${otpCode}`);
    }

    // Store OTP in database
    const { error: insertError } = await supabaseAdmin.from("otp_codes").insert({
      phone_number: formattedPhone,
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
      phone_number: formattedPhone,
      event_type: "otp_sent",
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      user_agent: req.headers.get("user-agent"),
      metadata: { purpose, termii_enabled: termiiEnabled, sms_sent: smsSent },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `OTP sent to ${maskPhoneNumber(formattedPhone)}`,
        masked_phone: maskPhoneNumber(formattedPhone),
        expires_in: expiryMinutes * 60,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send OTP error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
