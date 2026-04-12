import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailWithTestMode } from "../_shared/email-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      deviceId,
      deviceName,
      deviceModel,
      platform,
      osVersion,
    } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAnon.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.error("Auth error:", claimsError);
      return new Response(
        JSON.stringify({ success: true, alerted: false, reason: "auth_failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;

    const { data: existingDevice } = await supabaseAdmin
      .from("trusted_devices")
      .select("id")
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (existingDevice) {
      return new Response(
        JSON.stringify({ success: true, alerted: false, reason: "known_device" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = userEmail;
    if (!email) {
      return new Response(
        JSON.stringify({ success: true, alerted: false, reason: "no_email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .single();

    const userName = profile?.full_name || "User";

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "Unknown";

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
          <tr>
            <td style="background-color:#dc2626;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">⚠️ New Login Detected</h1>
              <p style="margin:4px 0 0;color:#fecaca;font-size:13px;">INKOTA SUB Security Alert</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;color:#18181b;line-height:1.6;">
                Hello <strong>${userName}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#3f3f46;line-height:1.6;">
                We detected a login to your INKOTA SUB account from a new device:
              </p>
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
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:14px;color:#991b1b;line-height:1.5;font-weight:600;">
                      🔒 If this was not you:
                    </p>
                    <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;color:#b91c1c;line-height:1.8;">
                      <li>Change your password immediately</li>
                      <li>Change your transaction PIN</li>
                      <li>Contact support</li>
                    </ul>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.5;">
                If this was you, you can safely ignore this email.
              </p>
            </td>
          </tr>
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

    const result = await sendEmailWithTestMode({
      to: email,
      subject: "⚠️ New Login Detected on Your INKOTA SUB Account",
      html: htmlContent,
    });

    console.log("Login alert email result:", JSON.stringify(result));

    return new Response(
      JSON.stringify({ success: true, alerted: true, testMode: result.testMode }),
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