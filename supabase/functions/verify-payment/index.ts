import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rewardReferralOnFirstFunding } from "../_shared/referral-reward.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getDepositSettings(supabase: any) {
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["deposit_charge_amount", "referral_bonus_amount"]);

  const settings: Record<string, number> = {
    deposit_charge_amount: 25,
    referral_bonus_amount: 50,
  };
  if (data) {
    for (const row of data) {
      const val = parseFloat(row.value);
      if (!isNaN(val)) settings[row.key] = val;
    }
  }
  return settings;
}

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const { reference } = await req.json();

    if (!reference) {
      return new Response(
        JSON.stringify({ status: "failed", message: "No reference provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify with Paystack
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}`,
        },
      }
    );

    const paystackData = await paystackResponse.json();
    console.log("Paystack verification response:", paystackData);

    if (!paystackData.status || paystackData.data?.status !== "success") {
      return new Response(
        JSON.stringify({
          status: "failed",
          message: paystackData.data?.gateway_response || "Payment verification failed",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amountInNaira = paystackData.data.amount / 100;
    const channel = paystackData.data.channel;

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existingTx } = await adminSupabase
      .from("transactions")
      .select("id, status, user_id")
      .eq("reference", reference)
      .single();

    // Validate reference ownership
    if (existingTx && existingTx.user_id !== userId) {
      console.warn("Reference ownership mismatch:", reference, "requested by:", userId);
      return new Response(
        JSON.stringify({ status: "failed", message: "Reference does not belong to this account" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paystackUserId = paystackData.data?.metadata?.user_id;
    if (paystackUserId && paystackUserId !== userId) {
      console.warn("Paystack metadata user_id mismatch:", paystackUserId, "vs", userId);
      return new Response(
        JSON.stringify({ status: "failed", message: "Payment does not belong to this account" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existingTx?.status === "success") {
      console.log("Transaction already processed:", reference);
      return new Response(
        JSON.stringify({
          status: "success",
          amount: amountInNaira,
          channel,
          message: "Payment already credited",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Apply deposit charge
    const settings = await getDepositSettings(adminSupabase);
    const depositCharge = settings.deposit_charge_amount;
    const netAmount = Math.max(0, amountInNaira - depositCharge);

    // Get balance before credit
    const { data: balanceBefore } = await adminSupabase.rpc("get_wallet_balance", { p_user_id: userId });
    const currentBalance = parseFloat(balanceBefore ?? "0");

    // Atomic credit with net amount
    const { data: newBal, error: creditError } = await adminSupabase.rpc("atomic_wallet_credit", {
      p_user_id: userId,
      p_amount: netAmount,
    });

    if (creditError) {
      console.error("Wallet credit error:", creditError);
      return new Response(
        JSON.stringify({ status: "failed", message: "Failed to credit wallet" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newBalance = parseFloat(newBal);

    // Create/update deposit transaction
    if (existingTx) {
      await adminSupabase
        .from("transactions")
        .update({
          status: "success",
          amount: netAmount,
          balance_before: currentBalance,
          balance_after: newBalance,
          metadata: { channel, verified_at: new Date().toISOString(), original_amount: amountInNaira, deposit_charge: depositCharge },
        })
        .eq("reference", reference);
    } else {
      await adminSupabase.from("transactions").insert({
        user_id: userId,
        type: "credit",
        amount: netAmount,
        balance_before: currentBalance,
        balance_after: newBalance,
        status: "success",
        reference,
        description: `Wallet funding via ${channel}`,
        metadata: { channel, original_amount: amountInNaira, deposit_charge: depositCharge },
      });
    }

    // Record deposit charge transaction
    if (depositCharge > 0) {
      await adminSupabase.from("transactions").insert({
        user_id: userId,
        type: "debit",
        amount: depositCharge,
        balance_before: currentBalance,
        balance_after: newBalance,
        status: "success",
        reference: `CHARGE-${reference}`,
        description: "Deposit processing fee",
        metadata: { type: "deposit_charge", original_deposit: amountInNaira },
      });
    }

    // Create notification
    await adminSupabase.from("notifications").insert({
      user_id: userId,
      title: "Payment Received",
      message: `Your wallet has been credited with ₦${netAmount.toLocaleString()} (₦${depositCharge} processing fee deducted from ₦${amountInNaira.toLocaleString()})`,
      type: "success",
    });

    console.log("Payment verified and credited:", reference, "net:", netAmount, "charge:", depositCharge);

    // Award referrer ₦50 on first wallet funding (idempotent — safe alongside webhook)
    await rewardReferralOnFirstFunding(userId, settings.referral_bonus_amount);


    // Send receipt email (fire-and-forget)
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-receipt-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          userId,
          type: "wallet_funding",
          amount: netAmount,
          reference,
          description: `Wallet funding via ${channel}`,
          balanceAfter: newBalance,
          originalAmount: amountInNaira,
          depositCharge,
          channel,
        }),
      });
    } catch (e) {
      console.error("Receipt email fire-and-forget error:", e);
    }

    return new Response(
      JSON.stringify({
        status: "success",
        amount: netAmount,
        originalAmount: amountInNaira,
        depositCharge,
        channel,
        message: "Payment successful",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Verification error:", error);
    return new Response(
      JSON.stringify({
        status: "failed",
        message: "Verification failed",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
