import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIGNUP_BONUS = 100; // ₦100 signup bonus for referrer

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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const referredUserId = user.id;
    const { referralCode } = await req.json();

    if (!referralCode || typeof referralCode !== "string") {
      return new Response(
        JSON.stringify({ error: "Referral code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check if user already has a referral record
    const { data: existingReferral } = await adminSupabase
      .from("referrals")
      .select("id")
      .eq("referred_id", referredUserId)
      .single();

    if (existingReferral) {
      return new Response(
        JSON.stringify({ success: true, message: "Referral already recorded" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find referrer by code
    const { data: referrerProfile } = await adminSupabase
      .from("profiles")
      .select("user_id")
      .eq("referral_code", referralCode.toUpperCase())
      .single();

    if (!referrerProfile) {
      return new Response(
        JSON.stringify({ error: "Invalid referral code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent self-referral
    if (referrerProfile.user_id === referredUserId) {
      return new Response(
        JSON.stringify({ error: "Cannot refer yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create referral record with signup bonus
    const { error: insertError } = await adminSupabase.from("referrals").insert({
      referrer_id: referrerProfile.user_id,
      referred_id: referredUserId,
      referral_code: referralCode.toUpperCase(),
      reward_amount: SIGNUP_BONUS,
      rewarded: true,
      status: "signup_rewarded",
    });

    if (insertError) {
      console.error("Error creating referral:", insertError);
      throw insertError;
    }

    // Credit the referrer's wallet with ₦100
    const { data: wallet } = await adminSupabase
      .from("wallets")
      .select("balance, ledger_balance")
      .eq("user_id", referrerProfile.user_id)
      .single();

    if (wallet) {
      const newBalance = Number(wallet.balance) + SIGNUP_BONUS;
      const newLedger = Number(wallet.ledger_balance) + SIGNUP_BONUS;

      await adminSupabase
        .from("wallets")
        .update({ balance: newBalance, ledger_balance: newLedger })
        .eq("user_id", referrerProfile.user_id);

      // Create transaction record for the referrer
      await adminSupabase.from("transactions").insert({
        user_id: referrerProfile.user_id,
        type: "credit",
        amount: SIGNUP_BONUS,
        balance_before: Number(wallet.balance),
        balance_after: newBalance,
        status: "success",
        description: "Referral signup bonus",
        reference: `REF-SIGNUP-${Date.now()}`,
        metadata: { type: "referral_bonus", referred_user: referredUserId },
      });

      // Send notification to referrer
      await adminSupabase.from("notifications").insert({
        user_id: referrerProfile.user_id,
        title: "Referral Bonus! 🎉",
        message: `You earned ₦${SIGNUP_BONUS} for referring a new user! You'll earn an additional ₦50 when they complete their first transaction.`,
        type: "referral",
      });
    }

    console.log(`Referral recorded & rewarded: ${referredUserId} referred by ${referrerProfile.user_id}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing referral:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
