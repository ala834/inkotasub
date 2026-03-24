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

    // Check if transaction was already credited via webhook
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existingTx } = await adminSupabase
      .from("transactions")
      .select("id, status, user_id")
      .eq("reference", reference)
      .single();

    // userId already set on line 36 from authenticated user

    // Validate reference ownership - transaction must belong to requesting user
    if (existingTx && existingTx.user_id !== userId) {
      console.warn("Reference ownership mismatch:", reference, "requested by:", userId);
      return new Response(
        JSON.stringify({ status: "failed", message: "Reference does not belong to this account" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Also validate Paystack metadata user_id matches
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

    // If webhook hasn't processed yet, process now (fallback)
    const { data: wallet } = await adminSupabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();

    const currentBalance = parseFloat(wallet?.balance || "0");
    const newBalance = currentBalance + amountInNaira;

    // Update wallet
    await adminSupabase
      .from("wallets")
      .update({ balance: newBalance })
      .eq("user_id", userId);

    // Create/update transaction
    if (existingTx) {
      await adminSupabase
        .from("transactions")
        .update({
          status: "success",
          balance_before: currentBalance,
          balance_after: newBalance,
          metadata: { channel, verified_at: new Date().toISOString() },
        })
        .eq("reference", reference);
    } else {
      await adminSupabase.from("transactions").insert({
        user_id: userId,
        type: "credit",
        amount: amountInNaira,
        balance_before: currentBalance,
        balance_after: newBalance,
        status: "success",
        reference,
        description: `Wallet funding via ${channel}`,
        metadata: { channel },
      });
    }

    // Create notification
    await adminSupabase.from("notifications").insert({
      user_id: userId,
      title: "Payment Received",
      message: `Your wallet has been credited with ₦${amountInNaira.toLocaleString()}`,
      type: "success",
    });

    console.log("Payment verified and credited:", reference, amountInNaira);

    return new Response(
      JSON.stringify({
        status: "success",
        amount: amountInNaira,
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
        message: error instanceof Error ? error.message : "Verification failed",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
