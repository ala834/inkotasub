// Verify a Paystack payment and credit the Developer (API) Wallet.
// Idempotent: a given reference can only credit api_wallets once.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ status: "failed", message: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ status: "failed", message: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const { reference } = await req.json();
    if (!reference) {
      return new Response(
        JSON.stringify({ status: "failed", message: "No reference provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Idempotency: check if this reference has already credited the api_wallet
    const { data: existingCredit } = await admin
      .from("api_wallet_ledger")
      .select("id, user_id, amount, balance_after")
      .eq("reference", reference)
      .eq("entry_type", "credit")
      .maybeSingle();

    if (existingCredit) {
      if (existingCredit.user_id !== userId) {
        return new Response(
          JSON.stringify({ status: "failed", message: "Reference does not belong to this account" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          status: "success",
          amount: Number(existingCredit.amount),
          balance: Number(existingCredit.balance_after),
          message: "Payment already credited",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify with Paystack
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}` } },
    );
    const paystackData = await paystackResponse.json();

    if (!paystackData.status || paystackData.data?.status !== "success") {
      return new Response(
        JSON.stringify({
          status: "failed",
          message: paystackData.data?.gateway_response || "Payment verification failed",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate ownership via Paystack metadata
    const meta = paystackData.data?.metadata ?? {};
    const paystackUserId: string | undefined = meta?.user_id;
    const walletType: string | undefined = meta?.wallet_type;

    if (paystackUserId && paystackUserId !== userId) {
      return new Response(
        JSON.stringify({ status: "failed", message: "Payment does not belong to this account" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (walletType && walletType !== "api_wallet") {
      return new Response(
        JSON.stringify({ status: "failed", message: "Reference is not for the Developer Wallet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const amountInNaira = Number(paystackData.data.amount) / 100;
    const channel = paystackData.data.channel;

    // Ensure wallet exists, then credit atomically
    await admin
      .from("api_wallets")
      .upsert({ user_id: userId, balance: 0 }, { onConflict: "user_id", ignoreDuplicates: true });

    const { data: balanceBefore } = await admin.rpc("get_api_wallet_balance", { p_user_id: userId });
    const currentBalance = Number(balanceBefore ?? 0);

    const { data: newBal, error: creditError } = await admin.rpc("atomic_api_wallet_credit", {
      p_user_id: userId,
      p_amount: amountInNaira,
    });
    if (creditError) {
      console.error("API wallet credit error:", creditError);
      return new Response(
        JSON.stringify({ status: "failed", message: "Failed to credit Developer Wallet" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const newBalance = Number(newBal);

    await admin.from("api_wallet_ledger").insert({
      user_id: userId,
      entry_type: "credit",
      amount: amountInNaira,
      balance_before: currentBalance,
      balance_after: newBalance,
      reference,
      metadata: {
        type: "paystack_funding",
        channel,
        provider: "paystack",
        verified_at: new Date().toISOString(),
      },
    });

    await admin.from("notifications").insert({
      user_id: userId,
      title: "Developer Wallet Funded",
      message: `Your Developer Wallet has been credited with ₦${amountInNaira.toLocaleString()} via ${channel}.`,
      type: "success",
    });

    console.log("API wallet credited:", reference, "user:", userId, "amount:", amountInNaira);

    return new Response(
      JSON.stringify({
        status: "success",
        amount: amountInNaira,
        balance: newBalance,
        channel,
        message: "Developer Wallet funded successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("verify-api-wallet-payment error:", error);
    return new Response(
      JSON.stringify({
        status: "failed",
        message: error instanceof Error ? error.message : "Verification failed",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
