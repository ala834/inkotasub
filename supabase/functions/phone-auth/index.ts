import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SignUpRequest {
  action: "signup";
  phoneNumber: string;
  password: string;
  fullName: string;
  verificationToken: string;
  referralCode?: string;
}

interface SignInRequest {
  action: "signin";
  phoneNumber: string;
  password: string;
}

interface ResetPasswordRequest {
  action: "reset_password";
  phoneNumber: string;
  newPassword: string;
  verificationToken: string;
}

type AuthRequest = SignUpRequest | SignInRequest | ResetPasswordRequest;

// Generate email from phone number for Supabase auth
function phoneToEmail(phone: string): string {
  const cleanPhone = phone.replace(/\D/g, "");
  return `${cleanPhone}@phone.inkotasub.ng`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body: AuthRequest = await req.json();
    const { action } = body;

    // Format phone number to +234 format
    const formatPhone = (phone: string): string => {
      let formatted = phone.replace(/[^\d+]/g, "");
      if (formatted.startsWith("0")) {
        formatted = "+234" + formatted.substring(1);
      } else if (formatted.startsWith("234") && !formatted.startsWith("+")) {
        formatted = "+" + formatted;
      } else if (!formatted.startsWith("+234")) {
        formatted = "+234" + formatted;
      }
      return formatted;
    };

    // Get all possible phone number formats for database lookup
    const getPhoneVariants = (phone: string): string[] => {
      const formatted = formatPhone(phone);
      const digits = formatted.replace(/\D/g, ""); // e.g., 2349057352833
      return [
        formatted,                           // +2349057352833
        digits,                              // 2349057352833
        "0" + digits.substring(3),           // 09057352833
        digits.substring(3),                 // 9057352833
      ];
    };

    if (action === "signup") {
      const { phoneNumber, password, fullName, verificationToken, referralCode } = body as SignUpRequest;
      const formattedPhone = formatPhone(phoneNumber);

      // Verify the verification token
      const { data: tokenRecord, error: tokenError } = await supabaseAdmin
        .from("otp_codes")
        .select("*")
        .eq("phone_number", formattedPhone)
        .eq("code", verificationToken)
        .eq("purpose", "verification_token")
        .eq("is_verified", false)
        .gte("expires_at", new Date().toISOString())
        .single();

      if (tokenError || !tokenRecord) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid or expired verification. Please start over." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if phone number already exists
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone_number", formattedPhone)
        .single();

      if (existingProfile) {
        return new Response(
          JSON.stringify({ success: false, error: "This phone number is already registered. Please sign in." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create user with phone-based email
      const email = phoneToEmail(formattedPhone);
      
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone_number: formattedPhone },
      });

      if (authError) {
        console.error("Auth creation error:", authError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to create account. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update profile with phone number
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ phone_number: formattedPhone, full_name: fullName })
        .eq("user_id", authData.user.id);

      if (profileError) {
        console.error("Profile update error:", profileError);
      }

      // Mark token as used
      await supabaseAdmin
        .from("otp_codes")
        .update({ is_verified: true })
        .eq("id", tokenRecord.id);

      // Process referral if provided
      if (referralCode) {
        try {
          await supabaseAdmin.functions.invoke("process-referral", {
            body: { referralCode, referredUserId: authData.user.id },
          });
        } catch (refError) {
          console.error("Referral processing error:", refError);
        }
      }

      // Log signup event
      await supabaseAdmin.from("auth_events").insert({
        user_id: authData.user.id,
        phone_number: formattedPhone,
        event_type: "signup_completed",
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
        user_agent: req.headers.get("user-agent"),
        metadata: { has_referral: !!referralCode },
      });

      // Sign in the user
      const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "");
      const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error("Auto sign-in error:", signInError);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Account created successfully. Please sign in.",
            require_login: true 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Account created successfully",
          session: signInData.session,
          user: signInData.user,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "signin") {
      const { phoneNumber, password } = body as SignInRequest;
      const formattedPhone = formatPhone(phoneNumber);
      const phoneVariants = getPhoneVariants(phoneNumber);
      const email = phoneToEmail(formattedPhone);

      // Check if user exists by phone (try all possible formats)
      let profile = null;
      for (const variant of phoneVariants) {
        const { data } = await supabaseAdmin
          .from("profiles")
          .select("user_id, phone_number")
          .eq("phone_number", variant)
          .single();
        if (data) {
          profile = data;
          break;
        }
      }

      if (!profile) {
        // Log failed attempt
        await supabaseAdmin.from("auth_events").insert({
          phone_number: formattedPhone,
          event_type: "login_failed",
          ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
          user_agent: req.headers.get("user-agent"),
          metadata: { reason: "phone_not_found", tried_variants: phoneVariants },
        });

        return new Response(
          JSON.stringify({ success: false, error: "Phone number not registered. Please sign up first." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Sign in with Supabase
      const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "");
      const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // Log failed attempt
        await supabaseAdmin.from("auth_events").insert({
          user_id: profile.user_id,
          phone_number: formattedPhone,
          event_type: "login_failed",
          ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
          user_agent: req.headers.get("user-agent"),
          metadata: { reason: "invalid_password" },
        });

        return new Response(
          JSON.stringify({ success: false, error: "Invalid phone number or password" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log successful login
      await supabaseAdmin.from("auth_events").insert({
        user_id: signInData.user?.id,
        phone_number: formattedPhone,
        event_type: "login_success",
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
        user_agent: req.headers.get("user-agent"),
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Signed in successfully",
          session: signInData.session,
          user: signInData.user,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reset_password") {
      const { phoneNumber, newPassword, verificationToken } = body as ResetPasswordRequest;
      const formattedPhone = formatPhone(phoneNumber);

      // Verify the reset token
      const { data: tokenRecord, error: tokenError } = await supabaseAdmin
        .from("otp_codes")
        .select("*")
        .eq("phone_number", formattedPhone)
        .eq("code", verificationToken)
        .eq("purpose", "reset_pin_token")
        .eq("is_verified", false)
        .gte("expires_at", new Date().toISOString())
        .single();

      if (tokenError || !tokenRecord) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid or expired verification. Please start over." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get user by phone (try all possible formats)
      const phoneVariants = getPhoneVariants(phoneNumber);
      let profile = null;
      for (const variant of phoneVariants) {
        const { data } = await supabaseAdmin
          .from("profiles")
          .select("user_id, phone_number")
          .eq("phone_number", variant)
          .single();
        if (data) {
          profile = data;
          break;
        }
      }

      if (!profile) {
        return new Response(
          JSON.stringify({ success: false, error: "Phone number not registered" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        profile.user_id,
        { password: newPassword }
      );

      if (updateError) {
        console.error("Password update error:", updateError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to update password. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark token as used
      await supabaseAdmin
        .from("otp_codes")
        .update({ is_verified: true })
        .eq("id", tokenRecord.id);

      // Log password reset
      await supabaseAdmin.from("auth_events").insert({
        user_id: profile.user_id,
        phone_number: formattedPhone,
        event_type: "pin_reset",
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
        user_agent: req.headers.get("user-agent"),
      });

      return new Response(
        JSON.stringify({ success: true, message: "Password updated successfully. Please sign in." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Phone auth error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
