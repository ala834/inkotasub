import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_DIRECT_URL = "https://api.resend.com/emails";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const DEFAULT_FROM = "INKOTA SUB <noreply@notify.www.inkotasub.com>";

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

interface SendEmailResult {
  success: boolean;
  testMode?: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Shared email sender with test mode support.
 * When EMAIL_TEST_MODE is "true" in app_settings, emails are logged but not sent.
 */
export async function sendEmailWithTestMode(options: SendEmailOptions): Promise<SendEmailResult> {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Check test mode setting
  const { data: testModeSetting } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "EMAIL_TEST_MODE")
    .single();

  const isTestMode = testModeSetting?.value === "true";
  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const sender = options.from || DEFAULT_FROM;

  if (isTestMode) {
    // Log the email instead of sending
    console.log("========== EMAIL TEST MODE ==========");
    console.log(`From: ${sender}`);
    console.log(`To: ${recipients.join(", ")}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`HTML Length: ${options.html.length} chars`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log("======================================");

    // Also log to email_send_log table for admin visibility
    await supabaseAdmin.from("email_send_log").insert({
      recipient_email: recipients[0],
      template_name: "test_mode",
      status: "test_mode_logged",
      message_id: `test_${Date.now()}`,
      metadata: {
        subject: options.subject,
        from: sender,
        to: recipients,
        html_length: options.html.length,
        test_mode: true,
      },
    });

    return { success: true, testMode: true, messageId: `test_${Date.now()}` };
  }

  // Production mode — send via gateway or direct Resend API
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!RESEND_API_KEY) {
    console.error("Missing RESEND_API_KEY");
    return { success: false, error: "Email service not configured" };
  }

  const emailPayload = JSON.stringify({
    from: sender,
    to: recipients,
    subject: options.subject,
    html: options.html,
  });

  let res: Response;

  // Try gateway first if LOVABLE_API_KEY is available, fallback to direct API
  if (LOVABLE_API_KEY) {
    res = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: emailPayload,
    });

    // If gateway fails with auth error, fallback to direct API
    if (res.status === 401 || res.status === 403) {
      console.log("Gateway auth failed, falling back to direct Resend API");
      res = await fetch(RESEND_DIRECT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: emailPayload,
      });
    }
  } else {
    res = await fetch(RESEND_DIRECT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: emailPayload,
    });
  }

  const data = await res.json();

  if (!res.ok) {
    console.error("Email send failed:", JSON.stringify(data));
    return { success: false, error: data.message || "Failed to send email" };
  }

  console.log("Email sent successfully:", JSON.stringify(data));
  return { success: true, messageId: data.id };
}
