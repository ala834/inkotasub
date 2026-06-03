import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hashPin, comparePin } from "../_shared/pin-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupabase = createClient(supabaseUrl, supabaseKey);

    const userSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, current_pin, new_pin, verification_token } = body;

    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("transaction_pin, failed_pin_attempts, pin_locked_until")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SET PIN (first time setup)
    if (action === "set") {
      if (profile.transaction_pin) {
        return new Response(JSON.stringify({ error: "PIN already set. Use 'change' action." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!new_pin || new_pin.length !== 4 || !/^\d{4}$/.test(new_pin)) {
        return new Response(JSON.stringify({ error: "PIN must be exactly 4 digits" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hashedPin = await hashPin(new_pin);
      await adminSupabase
        .from("profiles")
        .update({ transaction_pin: hashedPin, failed_pin_attempts: 0, pin_locked_until: null })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true, message: "Transaction PIN set successfully" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CHANGE PIN (legacy - requires current_pin)
    if (action === "change") {
      if (!profile.transaction_pin) {
        return new Response(JSON.stringify({ error: "No PIN set. Use 'set' action." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (profile.pin_locked_until && new Date(profile.pin_locked_until) > new Date()) {
        const remaining = Math.ceil((new Date(profile.pin_locked_until).getTime() - Date.now()) / 60000);
        return new Response(JSON.stringify({ 
          error: `Account locked. Try again in ${remaining} minutes.`,
          locked: true 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!current_pin || !new_pin) {
        return new Response(JSON.stringify({ error: "Current PIN and new PIN required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new_pin.length !== 4 || !/^\d{4}$/.test(new_pin)) {
        return new Response(JSON.stringify({ error: "New PIN must be exactly 4 digits" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pinValid = await comparePin(current_pin, profile.transaction_pin);
      if (!pinValid) {
        const newAttempts = (profile.failed_pin_attempts || 0) + 1;
        const lockUntil = newAttempts >= 3 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
        await adminSupabase.from("profiles")
          .update({ failed_pin_attempts: newAttempts, pin_locked_until: lockUntil })
          .eq("user_id", user.id);

        if (lockUntil) {
          return new Response(JSON.stringify({ 
            error: "Too many failed attempts. Transactions locked for 30 minutes.",
            locked: true,
            attempts: newAttempts
          }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ 
          error: `Incorrect PIN. ${3 - newAttempts} attempt(s) remaining.`,
          attempts: newAttempts
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hashedPin = await hashPin(new_pin);
      await adminSupabase
        .from("profiles")
        .update({ transaction_pin: hashedPin, failed_pin_attempts: 0, pin_locked_until: null })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true, message: "Transaction PIN updated successfully" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CHANGE PIN VIA OTP (requires verification_token from email OTP flow)
    if (action === "change_with_otp") {
      if (!profile.transaction_pin) {
        return new Response(JSON.stringify({ error: "No PIN set. Use 'set' action." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!verification_token) {
        return new Response(JSON.stringify({ error: "Verification token is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!new_pin || new_pin.length !== 4 || !/^\d{4}$/.test(new_pin)) {
        return new Response(JSON.stringify({ error: "New PIN must be exactly 4 digits" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate the verification token
      const userEmail = user.email?.toLowerCase();
      const { data: tokenRecord, error: tokenError } = await adminSupabase
        .from("otp_codes")
        .select("*")
        .eq("email", userEmail)
        .eq("code", verification_token)
        .eq("purpose", "reset_pin_token")
        .eq("is_verified", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (tokenError || !tokenRecord) {
        return new Response(JSON.stringify({ error: "Invalid or expired verification. Please verify your email again." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark token as used
      await adminSupabase
        .from("otp_codes")
        .update({ is_verified: true })
        .eq("id", tokenRecord.id);

      // Set new PIN
      const hashedPin = await hashPin(new_pin);
      await adminSupabase
        .from("profiles")
        .update({ transaction_pin: hashedPin, failed_pin_attempts: 0, pin_locked_until: null })
        .eq("user_id", user.id);

      // Log the event
      await adminSupabase.from("auth_events").insert({
        event_type: "pin_changed_via_otp",
        user_id: user.id,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
        user_agent: req.headers.get("user-agent"),
        metadata: { email: userEmail },
      });

      return new Response(JSON.stringify({ success: true, message: "Transaction PIN updated successfully" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'set', 'change', or 'change_with_otp'." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("manage-pin error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
