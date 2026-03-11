import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FIRST_TXN_BONUS = 50;

/**
 * Check if the user was referred and hasn't received first-transaction bonus yet.
 * If so, credit referrer ₦50 and update referral status.
 */
export async function checkAndRewardFirstTransaction(userId: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check if this user has a referral in signup_rewarded status
    const { data: referral } = await adminSupabase
      .from("referrals")
      .select("*")
      .eq("referred_id", userId)
      .eq("status", "signup_rewarded")
      .single();

    if (!referral) return;

    // Check if user has any prior successful transactions (this should be their first)
    const { count } = await adminSupabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "debit")
      .eq("status", "success");

    // Only reward on the very first successful debit transaction
    if ((count || 0) > 1) {
      // Already had transactions before, just mark as fully rewarded
      await adminSupabase
        .from("referrals")
        .update({ status: "fully_rewarded" })
        .eq("id", referral.id);
      return;
    }

    // Credit referrer wallet
    const { data: wallet } = await adminSupabase
      .from("wallets")
      .select("balance, ledger_balance")
      .eq("user_id", referral.referrer_id)
      .single();

    if (!wallet) return;

    const newBalance = Number(wallet.balance) + FIRST_TXN_BONUS;
    const newLedger = Number(wallet.ledger_balance) + FIRST_TXN_BONUS;
    const totalReward = Number(referral.reward_amount || 0) + FIRST_TXN_BONUS;

    await adminSupabase
      .from("wallets")
      .update({ balance: newBalance, ledger_balance: newLedger })
      .eq("user_id", referral.referrer_id);

    await adminSupabase
      .from("referrals")
      .update({ reward_amount: totalReward, status: "fully_rewarded" })
      .eq("id", referral.id);

    await adminSupabase.from("transactions").insert({
      user_id: referral.referrer_id,
      type: "credit",
      amount: FIRST_TXN_BONUS,
      balance_before: Number(wallet.balance),
      balance_after: newBalance,
      status: "success",
      description: "Referral first transaction bonus",
      reference: `REF-FIRSTTXN-${Date.now()}`,
      metadata: { type: "referral_first_txn_bonus", referred_user: userId },
    });

    await adminSupabase.from("notifications").insert({
      user_id: referral.referrer_id,
      title: "Bonus Earned! 💰",
      message: `You earned an additional ₦${FIRST_TXN_BONUS} because your referred user completed their first transaction!`,
      type: "referral",
    });

    console.log(`First-txn referral bonus credited to ${referral.referrer_id}`);
  } catch (error) {
    console.error("Error in checkAndRewardFirstTransaction:", error);
    // Don't throw - this shouldn't block the main transaction
  }
}
