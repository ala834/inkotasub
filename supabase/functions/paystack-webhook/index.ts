import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hash = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hash === signature;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;

    const isValid = await verifySignature(body, signature, secretKey);

    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(body);
    console.log("Webhook event:", event.event);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Log webhook
    await supabase.from("webhooks_log").insert({
      provider: "paystack",
      event_type: event.event,
      payload: event,
    });

    if (event.event === "charge.success") {
      const { reference, amount, customer, metadata } = event.data;
      const amountInNaira = amount / 100;
      const userId = metadata?.user_id;

      if (!userId) {
        console.error("No user_id in metadata");
        return new Response(JSON.stringify({ error: "No user_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if already processed (idempotency)
      const { data: existingTx } = await supabase
        .from("transactions")
        .select("id, status")
        .eq("reference", reference)
        .single();

      if (existingTx?.status === "success") {
        console.log("Transaction already processed:", reference);
        return new Response(JSON.stringify({ message: "Already processed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get current wallet balance
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .single();

      const currentBalance = parseFloat(wallet?.balance || "0");
      const newBalance = currentBalance + amountInNaira;

      // Update wallet
      const { error: walletError } = await supabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("user_id", userId);

      if (walletError) {
        console.error("Wallet update error:", walletError);
        throw walletError;
      }

      // Update transaction
      const { error: txError } = await supabase
        .from("transactions")
        .update({
          status: "success",
          balance_before: currentBalance,
          balance_after: newBalance,
        })
        .eq("reference", reference);

      if (txError) {
        console.error("Transaction update error:", txError);
        throw txError;
      }

      // Create notification for user
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "Payment Received",
        message: `Your wallet has been credited with ₦${amountInNaira.toLocaleString()}`,
        type: "success",
      });

      // Auto-process referral reward on first deposit
      // Check if this is the user's first successful credit transaction
      const { count: successfulCredits } = await supabase
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("type", "credit")
        .eq("status", "success");

      console.log("User successful credits count:", successfulCredits);

      // If this is the first successful deposit, check for pending referral
      if (successfulCredits === 1) {
        // Check if there's an unrewarded referral for this user
        const { data: pendingReferral } = await supabase
          .from("referrals")
          .select("*, referrer:referrer_id(user_id)")
          .eq("referred_id", userId)
          .eq("rewarded", false)
          .single();

        if (pendingReferral) {
          console.log("Processing pending referral for user:", userId);
          
          // Calculate reward (5% of first deposit)
          const rewardPercentage = pendingReferral.reward_percentage || 5;
          const rewardAmount = amountInNaira * (rewardPercentage / 100);

          // Get referrer's wallet
          const { data: referrerWallet } = await supabase
            .from("wallets")
            .select("*")
            .eq("user_id", pendingReferral.referrer_id)
            .single();

          if (referrerWallet) {
            const referrerNewBalance = parseFloat(referrerWallet.balance) + rewardAmount;

            // Credit referrer's wallet
            await supabase
              .from("wallets")
              .update({ balance: referrerNewBalance, updated_at: new Date().toISOString() })
              .eq("user_id", pendingReferral.referrer_id);

            // Create transaction for referral bonus
            await supabase.from("transactions").insert({
              user_id: pendingReferral.referrer_id,
              type: "credit",
              amount: rewardAmount,
              balance_before: referrerWallet.balance,
              balance_after: referrerNewBalance,
              status: "success",
              reference: `REF-${Date.now()}`,
              description: "Referral bonus",
              metadata: { referred_user_id: userId, deposit_amount: amountInNaira }
            });

            // Update referral record as rewarded
            await supabase
              .from("referrals")
              .update({ rewarded: true, reward_amount: rewardAmount })
              .eq("id", pendingReferral.id);

            // Notify referrer
            await supabase.from("notifications").insert({
              user_id: pendingReferral.referrer_id,
              title: "Referral Bonus!",
              message: `You earned ₦${rewardAmount.toLocaleString()} from your referral's first deposit!`,
              type: "success"
            });

            console.log(`Referral reward processed: ${pendingReferral.referrer_id} earned ₦${rewardAmount}`);
          }
        }
      }
      
      // Mark webhook as processed
      await supabase
        .from("webhooks_log")
        .update({ processed: true })
        .eq("payload->data->reference", reference);

      console.log("Payment processed successfully:", reference, amountInNaira);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
