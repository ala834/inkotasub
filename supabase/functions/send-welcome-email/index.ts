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
    const { email, fullName } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userName = fullName || "there";
    const year = new Date().getFullYear();

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
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">🎉 Welcome to INKOTA SUB!</h1>
              <p style="margin:8px 0 0;color:#e0e7ff;font-size:14px;">Your account has been created successfully</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 20px;font-size:16px;color:#18181b;line-height:1.6;">
                Hi <strong>${userName}</strong>,
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:#3f3f46;line-height:1.6;">
                Thank you for joining <strong>INKOTA SUB</strong>! We're excited to have you on board. Your account is now set up and ready to use.
              </p>

              <!-- Services Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;font-size:14px;color:#18181b;font-weight:700;">Here's what you can do:</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#3f3f46;">📱 <strong>Buy Airtime</strong> — Instant recharge for all networks</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#3f3f46;">📶 <strong>Buy Data</strong> — Affordable data bundles at the best prices</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#3f3f46;">📺 <strong>Cable TV</strong> — Subscribe to DSTV, GOtv, StarTimes & more</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#3f3f46;">⚡ <strong>Electricity</strong> — Pay your electricity bills easily</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#3f3f46;">📝 <strong>Exam Pins</strong> — WAEC, NECO & JAMB result checker PINs</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Getting Started -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px;font-size:14px;color:#3730a3;font-weight:600;">🚀 Getting Started</p>
                    <ol style="margin:0;padding-left:20px;font-size:13px;color:#4338ca;line-height:1.8;">
                      <li>Fund your wallet via bank transfer or card payment</li>
                      <li>Choose your desired service</li>
                      <li>Complete your transaction in seconds!</li>
                    </ol>
                  </td>
                </tr>
              </table>

              <!-- Referral -->
              <p style="margin:0 0 24px;font-size:14px;color:#3f3f46;line-height:1.6;">
                💰 <strong>Earn rewards!</strong> Refer friends and earn bonus rewards on every signup. Share your referral code from your profile page.
              </p>

              <p style="margin:0;font-size:14px;color:#71717a;line-height:1.5;">
                If you have any questions, our support team is always ready to help. Enjoy using INKOTA SUB!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center;">
                © ${year} INKOTA SUB. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      console.error("Missing LOVABLE_API_KEY or RESEND_API_KEY");
      return new Response(
        JSON.stringify({ success: false, error: "Email not configured" }),
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
        subject: "🎉 Welcome to INKOTA SUB!",
        html: htmlContent,
      }),
    });

    const emailResult = await emailRes.json();
    console.log("Welcome email result:", JSON.stringify(emailResult));

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Welcome email error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to send welcome email" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
