import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

interface ReceiptPayload {
  userId: string;
  type: "wallet_funding" | "vtu_purchase";
  amount: number;
  reference: string;
  description: string;
  balanceAfter: number;
  // Wallet funding specific
  originalAmount?: number;
  depositCharge?: number;
  channel?: string;
  // VTU specific
  serviceType?: string;
  recipient?: string;
  provider?: string;
}

function getServiceIcon(serviceType?: string): string {
  switch (serviceType) {
    case "airtime": return "📱";
    case "data": return "📶";
    case "cable": return "📺";
    case "electricity": return "⚡";
    case "exam_pin": return "📝";
    case "recharge_card": return "💳";
    default: return "💰";
  }
}

function getServiceLabel(serviceType?: string): string {
  switch (serviceType) {
    case "airtime": return "Airtime Purchase";
    case "data": return "Data Purchase";
    case "cable": return "Cable TV Subscription";
    case "electricity": return "Electricity Payment";
    case "exam_pin": return "Exam Card Purchase";
    case "recharge_card": return "Recharge Card Purchase";
    default: return "Transaction";
  }
}

function formatCurrency(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildReceiptHtml(payload: ReceiptPayload, userName: string): string {
  const isWallet = payload.type === "wallet_funding";
  const icon = isWallet ? "💰" : getServiceIcon(payload.serviceType);
  const title = isWallet ? "Wallet Funding Receipt" : getServiceLabel(payload.serviceType);
  const dateStr = new Date().toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const year = new Date().getFullYear();

  let detailRows = "";

  if (isWallet) {
    detailRows = `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#71717a;width:140px;">Gross Deposit</td>
        <td style="padding:8px 0;font-size:14px;color:#18181b;font-weight:600;">${formatCurrency(payload.originalAmount || payload.amount)}</td>
      </tr>
      ${payload.depositCharge ? `<tr>
        <td style="padding:8px 0;font-size:13px;color:#71717a;">Processing Fee</td>
        <td style="padding:8px 0;font-size:14px;color:#dc2626;font-weight:600;">-${formatCurrency(payload.depositCharge)}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#71717a;">Net Credit</td>
        <td style="padding:8px 0;font-size:14px;color:#16a34a;font-weight:700;">${formatCurrency(payload.amount)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#71717a;">Payment Method</td>
        <td style="padding:8px 0;font-size:14px;color:#18181b;font-weight:600;">${(payload.channel || "Card").charAt(0).toUpperCase() + (payload.channel || "card").slice(1)}</td>
      </tr>`;
  } else {
    detailRows = `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#71717a;width:140px;">Service</td>
        <td style="padding:8px 0;font-size:14px;color:#18181b;font-weight:600;">${getServiceLabel(payload.serviceType)}</td>
      </tr>
      ${payload.recipient ? `<tr>
        <td style="padding:8px 0;font-size:13px;color:#71717a;">Recipient</td>
        <td style="padding:8px 0;font-size:14px;color:#18181b;font-weight:600;">${payload.recipient}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#71717a;">Amount</td>
        <td style="padding:8px 0;font-size:14px;color:#18181b;font-weight:700;">${formatCurrency(payload.amount)}</td>
      </tr>`;
  }

  return `
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
            <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${icon} ${title}</h1>
              <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;">Transaction Successful</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 20px;font-size:15px;color:#18181b;line-height:1.6;">
                Hi <strong>${userName}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#3f3f46;line-height:1.6;">
                ${isWallet
                  ? "Your wallet has been funded successfully. Here's your receipt:"
                  : "Your transaction has been completed successfully. Here are the details:"}
              </p>

              <!-- Receipt Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${detailRows}
                      <tr>
                        <td colspan="2" style="padding:12px 0 4px;"><hr style="border:none;border-top:1px dashed #d4d4d8;margin:0;"/></td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;font-size:13px;color:#71717a;">Reference</td>
                        <td style="padding:8px 0;font-size:12px;color:#71717a;font-family:monospace;word-break:break-all;">${payload.reference}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;font-size:13px;color:#71717a;">Date</td>
                        <td style="padding:8px 0;font-size:14px;color:#18181b;font-weight:600;">${dateStr}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;font-size:13px;color:#71717a;">Wallet Balance</td>
                        <td style="padding:8px 0;font-size:14px;color:#6366f1;font-weight:700;">${formatCurrency(payload.balanceAfter)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.5;">
                This is an automated receipt from INKOTA SUB. If you did not authorize this transaction, please contact support immediately.
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
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: ReceiptPayload = await req.json();

    if (!payload.userId || !payload.reference) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get user email and name
    const { data: { user } } = await adminSupabase.auth.admin.getUserById(payload.userId);
    if (!user?.email) {
      return new Response(
        JSON.stringify({ success: true, sent: false, reason: "no_email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", payload.userId)
      .single();

    const userName = profile?.full_name || "Customer";
    const htmlContent = buildReceiptHtml(payload, userName);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      console.error("Missing LOVABLE_API_KEY or RESEND_API_KEY");
      return new Response(
        JSON.stringify({ success: true, sent: false, reason: "email_not_configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isWallet = payload.type === "wallet_funding";
    const subject = isWallet
      ? `✅ Wallet Funded: ${formatCurrency(payload.amount)} credited`
      : `✅ ${getServiceLabel(payload.serviceType)} Receipt — ${formatCurrency(payload.amount)}`;

    const emailRes = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "INKOTA SUB <noreply@notify.www.inkotasub.com>",
        to: [user.email],
        subject,
        html: htmlContent,
      }),
    });

    const emailResult = await emailRes.json();
    console.log("Receipt email result:", JSON.stringify(emailResult));

    return new Response(
      JSON.stringify({ success: true, sent: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Receipt email error:", error);
    return new Response(
      JSON.stringify({ success: true, sent: false, reason: "error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
