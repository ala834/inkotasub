import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRST_TXN_BONUS = 50; // ₦50 bonus when referred user completes first transaction

Deno.serve(async (req) => {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Check if user was referred and referral is in signup_rewarded status
    const { data: referral } = await adminSupabase
      .from("referrals")
      .select("*")
      .eq("referred_id", userId)
      .eq("status", "signup_rewarded")
      .single();

    if (!referral) {
      // No pending first-txn reward
      return new Response(
        JSON.stringify({ success: true, message: "No pending referral reward" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Credit referrer wallet with ₦50
    const { data: wallet } = await adminSupabase
      .from("wallets")
      .select("balance, ledger_balance")
      .eq("user_id", referral.referrer_id)
      .single();

    if (wallet) {
      const newBalance = Number(wallet.balance) + FIRST_TXN_BONUS;
      const newLedger = Number(wallet.ledger_balance) + FIRST_TXN_BONUS;
      const totalReward = Number(referral.reward_amount || 0) + FIRST_TXN_BONUS;

      await adminSupabase
        .from("wallets")
        .update({ balance: newBalance, ledger_balance: newLedger })
        .eq("user_id", referral.referrer_id);

      // Update referral record
      await adminSupabase
        .from("referrals")
        .update({ reward_amount: totalReward, status: "fully_rewarded" })
        .eq("id", referral.id);

      // Create transaction
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

      // Notify referrer
      await adminSupabase.from("notifications").insert({
        user_id: referral.referrer_id,
        title: "Bonus Earned! 💰",
        message: `You earned an additional ₦${FIRST_TXN_BONUS} because your referred user completed their first transaction!`,
        type: "referral",
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing first-txn reward:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
