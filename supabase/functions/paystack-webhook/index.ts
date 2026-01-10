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

// Helper function to process wallet credit
async function processWalletCredit(
  supabase: any,
  userId: string,
  amountInNaira: number,
  reference: string,
  description: string
) {
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

  // Create or update transaction
  const { data: existingTx } = await supabase
    .from("transactions")
    .select("id")
    .eq("reference", reference)
    .single();

  if (existingTx) {
    await supabase
      .from("transactions")
      .update({
        status: "success",
        balance_before: currentBalance,
        balance_after: newBalance,
      })
      .eq("reference", reference);
  } else {
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "credit",
      amount: amountInNaira,
      balance_before: currentBalance,
      balance_after: newBalance,
      status: "success",
      reference,
      description,
    });
  }

  // Create notification for user
  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Payment Received",
    message: `Your wallet has been credited with ₦${amountInNaira.toLocaleString()}`,
    type: "success",
  });

  // Auto-process referral reward on first deposit
  const { count: successfulCredits } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "credit")
    .eq("status", "success");

  console.log("User successful credits count:", successfulCredits);

  // If this is the first successful deposit, check for pending referral
  if (successfulCredits === 1) {
    const { data: pendingReferral } = await supabase
      .from("referrals")
      .select("*")
      .eq("referred_id", userId)
      .eq("rewarded", false)
      .single();

    if (pendingReferral) {
      console.log("Processing pending referral for user:", userId);
      
      const rewardPercentage = pendingReferral.reward_percentage || 5;
      const rewardAmount = amountInNaira * (rewardPercentage / 100);

      const { data: referrerWallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", pendingReferral.referrer_id)
        .single();

      if (referrerWallet) {
        const referrerNewBalance = parseFloat(referrerWallet.balance) + rewardAmount;

        await supabase
          .from("wallets")
          .update({ balance: referrerNewBalance, updated_at: new Date().toISOString() })
          .eq("user_id", pendingReferral.referrer_id);

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

        await supabase
          .from("referrals")
          .update({ rewarded: true, reward_amount: rewardAmount })
          .eq("id", pendingReferral.id);

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
    console.log("Webhook event:", event.event, "channel:", event.data?.channel);

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

    // Handle DVA assignment success
    if (event.event === "dedicatedaccount.assign.success") {
      console.log("DVA assigned successfully:", event.data);
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle successful charge
    if (event.event === "charge.success") {
      const { reference, amount, customer, metadata } = event.data;
      const amountInNaira = amount / 100;
      const channel = event.data.channel;

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

      let userId: string | null = null;
      let description = "Wallet funding";

      // Handle DVA transfer (dedicated_nuban channel)
      if (channel === "dedicated_nuban") {
        const accountNumber = event.data.authorization?.receiver_bank_account_number;
        const customerEmail = customer?.email;
        
        console.log("DVA transfer received:", { reference, amountInNaira, customerEmail, accountNumber });

        // Find user by virtual account number
        if (accountNumber) {
          const { data: virtualAccount } = await supabase
            .from("virtual_accounts")
            .select("user_id")
            .eq("account_number", accountNumber)
            .single();

          if (virtualAccount) {
            userId = virtualAccount.user_id;
          }
        }

        // Fallback to email lookup
        if (!userId && customerEmail) {
          const { data: users } = await supabase.auth.admin.listUsers();
          const user = users.users.find((u: any) => u.email === customerEmail);
          if (user) {
            userId = user.id;
          }
        }

        description = "Bank transfer funding";
      } else {
        // Regular card/bank payment with metadata
        userId = metadata?.user_id;
      }

      if (!userId) {
        console.error("Could not find user for transaction:", { reference, channel });
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await processWalletCredit(supabase, userId, amountInNaira, reference, description);
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
