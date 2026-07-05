import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'moderator'])
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { wallet_id, user_id, adjustment_type, amount, reason } = await req.json();

    if (!wallet_id || !user_id || !adjustment_type || !amount || !reason?.trim()) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get current wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', wallet_id)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ error: 'Wallet not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const currentBalance = parseFloat(wallet.balance as unknown as string);

    // Use atomic RPC to prevent race conditions
    let newBalance: number;
    if (adjustment_type === 'credit') {
      const { data, error: rpcErr } = await supabase.rpc('atomic_wallet_credit', {
        p_user_id: user_id, p_amount: amountNum,
      });
      if (rpcErr) throw rpcErr;
      newBalance = parseFloat(data as unknown as string);
    } else {
      const { data, error: rpcErr } = await supabase.rpc('atomic_wallet_debit', {
        p_user_id: user_id, p_amount: amountNum,
      });
      if (rpcErr) {
        const msg = rpcErr.message?.includes('insufficient_balance') ? 'Insufficient balance for debit' : rpcErr.message;
        return new Response(JSON.stringify({ error: msg }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      newBalance = parseFloat(data as unknown as string);
    }

    const reference = `ADJ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const description = `Admin ${adjustment_type === 'credit' ? 'Credit' : 'Debit'}: ${reason}`;

    // Ledger entry for auditability
    await supabase.from('ledger_entries').insert({
      user_id,
      entry_type: adjustment_type === 'credit' ? 'credit' : 'debit',
      amount: amountNum,
      balance_before: currentBalance,
      balance_after: newBalance,
      reference,
      metadata: { source: 'admin_adjustment', admin_id: user.id, reason },
    });

    // Create transaction record
    const { data: txRecord, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id,
        type: adjustment_type,
        amount: amountNum,
        balance_before: currentBalance,
        balance_after: newBalance,
        status: 'success',
        reference,
        description,
        metadata: {
          admin_id: user.id,
          reason,
          source: 'admin_adjustment',
          adjustment_type,
        },
      })
      .select('id')
      .single();

    if (txError) {
      console.error('Transaction insert error:', txError);
    }

    // Log admin activity
    await supabase.from('admin_activity_log').insert({
      admin_id: user.id,
      action: `wallet_${adjustment_type}`,
      target_user_id: user_id,
      target_type: 'wallet',
      target_id: wallet_id,
      details: {
        amount: amountNum,
        reason,
        balance_before: currentBalance,
        balance_after: newBalance,
        reference,
        transaction_id: txRecord?.id,
      },
    });

    // Create user notification
    await supabase.from('notifications').insert({
      user_id,
      title: adjustment_type === 'credit' ? 'Wallet Credited' : 'Wallet Debited',
      message: `Your wallet has been ${adjustment_type === 'credit' ? 'credited with' : 'debited by'} ₦${amountNum.toLocaleString()}. Reason: ${reason}`,
      type: adjustment_type === 'credit' ? 'success' : 'warning',
    });

    console.log(`Admin wallet adjustment: ${user.id} ${adjustment_type} ₦${amountNum} for user ${user_id}`);

    return new Response(JSON.stringify({
      success: true,
      message: `Wallet ${adjustment_type === 'credit' ? 'credited' : 'debited'} successfully`,
      data: {
        transaction_id: txRecord?.id,
        reference,
        amount: amountNum,
        balance_before: currentBalance,
        balance_after: newBalance,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Admin wallet adjustment error:', error);
    return new Response(JSON.stringify({ error: 'Failed to adjust wallet' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
