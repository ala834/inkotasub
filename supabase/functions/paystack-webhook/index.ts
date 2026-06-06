import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rewardReferralOnFirstFunding } from "../_shared/referral-reward.ts";

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

// Get admin-configurable settings
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

// Helper function to process wallet credit with deposit charge
async function processWalletCredit(
  supabase: any,
  userId: string,
  amountInNaira: number,
  reference: string,
  description: string
) {
  const settings = await getDepositSettings(supabase);
  const depositCharge = settings.deposit_charge_amount;
  const netAmount = Math.max(0, amountInNaira - depositCharge);

  // Get balance before credit for transaction record
  const { data: balanceBefore } = await supabase.rpc("get_wallet_balance", { p_user_id: userId });
  const currentBalance = parseFloat(balanceBefore ?? "0");

  // Atomic credit with net amount (after charge)
  const { data: newBalance, error: creditError } = await supabase.rpc("atomic_wallet_credit", {
    p_user_id: userId,
    p_amount: netAmount,
  });

  if (creditError) {
    console.error("Wallet credit error:", creditError);
    throw creditError;
  }

  const balanceAfter = parseFloat(newBalance);

  // Create or update deposit transaction (net amount)
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
        amount: netAmount,
        balance_before: currentBalance,
        balance_after: balanceAfter,
        metadata: { original_amount: amountInNaira, deposit_charge: depositCharge },
      })
      .eq("reference", reference);
  } else {
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "credit",
      amount: netAmount,
      balance_before: currentBalance,
      balance_after: balanceAfter,
      status: "success",
      reference,
      description,
      metadata: { original_amount: amountInNaira, deposit_charge: depositCharge },
    });
  }

  // Record deposit charge transaction
  if (depositCharge > 0) {
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "debit",
      amount: depositCharge,
      balance_before: currentBalance,
      balance_after: balanceAfter,
      status: "success",
      reference: `CHARGE-${reference}`,
      description: "Deposit processing fee",
      metadata: { type: "deposit_charge", original_deposit: amountInNaira },
    });
  }

  // Create notification for user
  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Payment Received",
    message: `Your wallet has been credited with ₦${netAmount.toLocaleString()} (₦${depositCharge} processing fee deducted from ₦${amountInNaira.toLocaleString()})`,
    type: "success",
  });

  // Award referrer ₦50 on the user's FIRST successful wallet funding (idempotent)
  await rewardReferralOnFirstFunding(userId, settings.referral_bonus_amount);

  // Mark webhook as processed
  await supabase
    .from("webhooks_log")
    .update({ processed: true })
    .eq("payload->data->reference", reference);

  console.log("Payment processed successfully:", reference, "net:", netAmount, "charge:", depositCharge);
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

      let walletType: "main" | "developer" = "main";

      // Handle DVA transfer (dedicated_nuban channel)
      if (channel === "dedicated_nuban") {
        const accountNumber = event.data.authorization?.receiver_bank_account_number;
        const customerEmail = customer?.email;

        console.log("DVA transfer received:", { reference, amountInNaira, customerEmail, accountNumber });

        if (accountNumber) {
          const { data: virtualAccount } = await supabase
            .from("virtual_accounts")
            .select("user_id, wallet_type")
            .eq("account_number", accountNumber)
            .maybeSingle();

          if (virtualAccount) {
            userId = virtualAccount.user_id;
            walletType = (virtualAccount.wallet_type as "main" | "developer") || "main";
          }
        }

        if (!userId && customerEmail) {
          // Strip +dev for matching the real auth email
          const realEmail = customerEmail.replace(/\+dev@/, "@");
          const { data: users } = await supabase.auth.admin.listUsers();
          const user = users.users.find((u: any) => u.email === realEmail || u.email === customerEmail);
          if (user) userId = user.id;
          if (customerEmail.includes("+dev@")) walletType = "developer";
        }

        description = walletType === "developer"
          ? "Developer Wallet funding (DVA)"
          : "Bank transfer funding (DVA)";
      } else if (channel === "bank_transfer" || channel === "bank") {
        userId = metadata?.user_id;
        description = "Bank transfer funding";
      } else if (channel === "ussd") {
        userId = metadata?.user_id;
        description = "USSD funding";
      } else if (channel === "card") {
        userId = metadata?.user_id;
        description = "Card funding";
      } else {
        userId = metadata?.user_id;
        description = `Wallet funding via ${channel}`;
      }

      // Allow explicit override via metadata
      if (metadata?.wallet_type === "api_wallet" || metadata?.wallet_type === "developer") {
        walletType = "developer";
      }

      if (!userId) {
        console.error("Could not find user for transaction:", { reference, channel });
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (walletType === "developer") {
        // Credit api_wallet (no deposit charge; idempotent via ledger reference)
        const { data: existingLedger } = await supabase
          .from("api_wallet_ledger")
          .select("id")
          .eq("reference", reference)
          .eq("entry_type", "credit")
          .maybeSingle();

        if (!existingLedger) {
          await supabase
            .from("api_wallets")
            .upsert({ user_id: userId, balance: 0 }, { onConflict: "user_id", ignoreDuplicates: true });

          const { data: balBefore } = await supabase.rpc("get_api_wallet_balance", { p_user_id: userId });
          const before = Number(balBefore ?? 0);

          const { data: newBal, error: creditErr } = await supabase.rpc("atomic_api_wallet_credit", {
            p_user_id: userId,
            p_amount: amountInNaira,
          });
          if (creditErr) {
            console.error("API wallet DVA credit error:", creditErr);
            throw creditErr;
          }

          await supabase.from("api_wallet_ledger").insert({
            user_id: userId,
            entry_type: "credit",
            amount: amountInNaira,
            balance_before: before,
            balance_after: Number(newBal),
            reference,
            metadata: { type: "paystack_dva_funding", channel, provider: "paystack" },
          });

          await supabase.from("notifications").insert({
            user_id: userId,
            title: "Developer Wallet Funded",
            message: `Your Developer Wallet has been credited with ₦${amountInNaira.toLocaleString()} via bank transfer.`,
            type: "success",
          });
        }
      } else {
        await processWalletCredit(supabase, userId, amountInNaira, reference, description);
      }
    }


    // Handle successful transfer (Payouts/Disbursements)
    if (event.event === "transfer.success") {
      const { reference, amount, recipient } = event.data;
      const amountInNaira = amount / 100;
      console.log("Transfer success:", { reference, amountInNaira, recipient: recipient?.name });

      const { data: existingTx } = await supabase
        .from("transactions")
        .select("id, status")
        .eq("reference", reference)
        .single();

      if (existingTx && existingTx.status !== "success") {
        await supabase
          .from("transactions")
          .update({ status: "success" })
          .eq("reference", reference);
      }
    }

    // Handle failed transfer
    if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
      const { reference, amount, reason } = event.data;
      const amountInNaira = amount / 100;
      console.log("Transfer failed/reversed:", { reference, amountInNaira, reason });

      const { data: tx } = await supabase
        .from("transactions")
        .select("*")
        .eq("reference", reference)
        .single();

      if (tx && tx.status !== "failed") {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", tx.user_id)
          .single();

        if (wallet) {
          const currentBalance = parseFloat(wallet.balance as unknown as string);
          const newBalance = currentBalance + amountInNaira;

          await supabase
            .from("wallets")
            .update({ balance: newBalance })
            .eq("user_id", tx.user_id);

          await supabase
            .from("transactions")
            .update({ 
              status: "failed",
              metadata: { ...tx.metadata, failure_reason: reason }
            })
            .eq("reference", reference);

          await supabase.from("notifications").insert({
            user_id: tx.user_id,
            title: "Transfer Failed",
            message: `Your transfer of ₦${amountInNaira.toLocaleString()} failed. Amount has been refunded.`,
            type: "error",
          });
        }
      }
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
