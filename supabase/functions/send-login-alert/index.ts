import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      deviceId,
      deviceName,
      deviceModel,
      platform,
      osVersion,
    } = await req.json();

    // Check if this device already exists for user (known device)
    const { data: existingDevice } = await supabaseAdmin
      .from("trusted_devices")
      .select("id")
      .eq("user_id", user.id)
      .eq("device_id", deviceId)
      .maybeSingle();

    // Only send alert for NEW devices
    if (existingDevice) {
      return new Response(
        JSON.stringify({ success: true, alerted: false, reason: "known_device" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user email and profile
    const email = user.email;
    if (!email) {
      return new Response(
        JSON.stringify({ success: true, alerted: false, reason: "no_email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single();

    const userName = profile?.full_name || "User";

    // Get IP and approximate location
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "Unknown";

    // Try to get location from IP (best-effort via Cloudflare headers)
    const country = req.headers.get("cf-ipcountry") || "Unknown";
    const city = req.headers.get("cf-ipcity") || "";
    const location = city ? `${city}, ${country}` : country;

    const loginTime = new Date().toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    // Build email HTML
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:#dc2626;padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">⚠️ New Login Detected</h1>
                    <p style="margin:4px 0 0;color:#fecaca;font-size:13px;">INKOTA SUB Security Alert</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;color:#18181b;line-height:1.6;">
                Hello <strong>${userName}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#3f3f46;line-height:1.6;">
                We detected a login to your INKOTA SUB account from a new device. Here are the details:
              </p>

              <!-- Device Details Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#71717a;width:120px;">Device</td>
                        <td style="padding:6px 0;font-size:14px;color:#18181b;font-weight:600;">${deviceName || deviceModel || "Unknown"}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#71717a;">Platform</td>
                        <td style="padding:6px 0;font-size:14px;color:#18181b;font-weight:600;">${platform || "Unknown"} ${osVersion || ""}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#71717a;">IP Address</td>
                        <td style="padding:6px 0;font-size:14px;color:#18181b;font-weight:600;">${clientIp}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#71717a;">Location</td>
                        <td style="padding:6px 0;font-size:14px;color:#18181b;font-weight:600;">${location}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#71717a;">Time</td>
                        <td style="padding:6px 0;font-size:14px;color:#18181b;font-weight:600;">${loginTime}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Warning -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:14px;color:#991b1b;line-height:1.5;font-weight:600;">
                      🔒 If this was not you, please take immediate action:
                    </p>
                    <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;color:#b91c1c;line-height:1.8;">
                      <li>Change your password immediately</li>
                      <li>Change your transaction PIN</li>
                      <li>Contact support if your account has been compromised</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.5;">
                If this was you, you can safely ignore this email. We send these alerts to help protect your account.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center;">
                © ${new Date().getFullYear()} INKOTA SUB. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send via Resend
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      console.error("Missing LOVABLE_API_KEY or RESEND_API_KEY");
      return new Response(
        JSON.stringify({ success: true, alerted: false, reason: "email_not_configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRes = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "INKOTA SUB <noreply@notify.www.inkotasub.com>",
        to: [email],
        subject: "⚠️ New Login Detected on Your INKOTA SUB Account",
        html: htmlContent,
      }),
    });

    const emailResult = await emailRes.json();
    console.log("Login alert email result:", JSON.stringify(emailResult));

    return new Response(
      JSON.stringify({ success: true, alerted: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Login alert error:", error);
    return new Response(
      JSON.stringify({ success: true, alerted: false, reason: "error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
