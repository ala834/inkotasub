import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, deposit_amount, referral_code } = await req.json();

    if (!user_id || !deposit_amount || !referral_code) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the referrer by code
    const { data: referrerProfile, error: referrerError } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .eq('referral_code', referral_code.toUpperCase())
      .single();

    if (referrerError || !referrerProfile) {
      console.log('Referral code not found:', referral_code);
      return new Response(JSON.stringify({ error: 'Invalid referral code' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (referrerProfile.user_id === user_id) {
      return new Response(JSON.stringify({ error: 'Cannot refer yourself' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if referral already exists and is rewarded
    const { data: existingReferral } = await supabase
      .from('referrals')
      .select('*')
      .eq('referred_id', user_id)
      .single();

    if (existingReferral?.rewarded) {
      return new Response(JSON.stringify({ message: 'Referral already rewarded' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate reward (5% of first deposit)
    const rewardPercentage = 5;
    const rewardAmount = parseFloat(deposit_amount) * (rewardPercentage / 100);

    // Create or update referral record
    if (existingReferral) {
      await supabase
        .from('referrals')
        .update({
          reward_amount: rewardAmount,
          rewarded: true
        })
        .eq('id', existingReferral.id);
    } else {
      await supabase.from('referrals').insert({
        referrer_id: referrerProfile.user_id,
        referred_id: user_id,
        referral_code: referral_code.toUpperCase(),
        reward_percentage: rewardPercentage,
        reward_amount: rewardAmount,
        rewarded: true
      });
    }

    // Credit referrer's wallet
    const { data: referrerWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', referrerProfile.user_id)
      .single();

    if (referrerWallet) {
      const newBalance = parseFloat(referrerWallet.balance) + rewardAmount;
      
      await supabase
        .from('wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('user_id', referrerProfile.user_id);

      // Create transaction for referral bonus
      await supabase.from('transactions').insert({
        user_id: referrerProfile.user_id,
        type: 'credit',
        amount: rewardAmount,
        balance_before: referrerWallet.balance,
        balance_after: newBalance,
        status: 'success',
        reference: `REF-${Date.now()}`,
        description: 'Referral bonus',
        metadata: { referred_user_id: user_id, deposit_amount }
      });

      // Notify referrer
      await supabase.from('notifications').insert({
        user_id: referrerProfile.user_id,
        title: 'Referral Bonus!',
        message: `You earned ₦${rewardAmount.toLocaleString()} from your referral's first deposit!`,
        type: 'success'
      });
    }

    console.log(`Referral processed: ${referrerProfile.user_id} earned ${rewardAmount} from ${user_id}`);

    return new Response(JSON.stringify({
      success: true,
      reward_amount: rewardAmount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Process referral error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process referral' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
