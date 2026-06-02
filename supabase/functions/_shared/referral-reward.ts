import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_BONUS = 50;

/**
 * Award the referrer ₦50 when the referred user completes their FIRST successful wallet funding.
 * - Idempotent: only fires if referral.status is still "pending"/"signup_rewarded".
 * - Reward only the referrer. Referred user gets nothing.
 * - Triggered exclusively by wallet funding flows (paystack-webhook, verify-payment).
 */
export async function rewardReferralOnFirstFunding(
  userId: string,
  bonusAmount: number = DEFAULT_BONUS,
) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Only on the very first successful credit (wallet funding)
    const { count: successfulCredits } = await admin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "credit")
      .eq("status", "success");

    if ((successfulCredits ?? 0) !== 1) return;

    // Find pending referral (not yet rewarded)
    const { data: referral } = await admin
      .from("referrals")
      .select("*")
      .eq("referred_id", userId)
      .in("status", ["pending", "signup_rewarded"])
      .maybeSingle();

    if (!referral) return;

    // Atomic claim — prevent double reward by gating on status
    const { data: claimed, error: claimErr } = await admin
      .from("referrals")
      .update({ status: "processing" })
      .eq("id", referral.id)
      .in("status", ["pending", "signup_rewarded"])
      .select()
      .maybeSingle();

    if (claimErr || !claimed) return;

    const { data: balBefore } = await admin.rpc("get_wallet_balance", {
      p_user_id: referral.referrer_id,
    });
    const refBalBefore = parseFloat(balBefore ?? "0");

    const { data: newBal, error: creditErr } = await admin.rpc("atomic_wallet_credit", {
      p_user_id: referral.referrer_id,
      p_amount: bonusAmount,
    });

    if (creditErr) {
      // Roll status back so we can retry later
      await admin
        .from("referrals")
        .update({ status: referral.status })
        .eq("id", referral.id);
      console.error("Referral credit failed:", creditErr);
      return;
    }

    const refBalAfter = parseFloat(newBal);

    await admin.from("transactions").insert({
      user_id: referral.referrer_id,
      type: "credit",
      amount: bonusAmount,
      balance_before: refBalBefore,
      balance_after: refBalAfter,
      status: "success",
      reference: `REF-BONUS-${referral.id}`,
      description: "Referral reward — first wallet funding",
      metadata: { type: "referral_bonus", referred_user: userId, referral_id: referral.id },
    });

    await admin
      .from("referrals")
      .update({
        rewarded: true,
        reward_amount: bonusAmount,
        status: "fully_rewarded",
      })
      .eq("id", referral.id);

    await admin.from("notifications").insert({
      user_id: referral.referrer_id,
      title: "Referral Bonus! 🎉",
      message: `You earned ₦${bonusAmount} — your referred user funded their wallet for the first time!`,
      type: "success",
    });

    console.log(`Referral bonus ₦${bonusAmount} → ${referral.referrer_id} (referred ${userId})`);
  } catch (err) {
    console.error("rewardReferralOnFirstFunding error:", err);
  }
}

/**
 * @deprecated Referral reward is now tied to first wallet funding only.
 * Kept as a no-op so existing imports don't break.
 */
export async function checkAndRewardFirstTransaction(_userId: string) {
  return;
}
