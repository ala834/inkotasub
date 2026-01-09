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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { recipient_identifier, amount, description } = await req.json();

    // Validate inputs
    if (!recipient_identifier || !amount) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find recipient by phone or email
    const identifier = recipient_identifier.trim().toLowerCase();
    let recipientQuery = supabase.from('profiles').select('user_id, full_name, phone_number');
    
    // Check if it's an email (contains @) or phone number
    if (identifier.includes('@')) {
      // Search by email in auth.users via profiles
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const matchedUser = authUsers?.users?.find(u => u.email?.toLowerCase() === identifier);
      
      if (!matchedUser) {
        return new Response(JSON.stringify({ error: 'Recipient not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      recipientQuery = supabase.from('profiles').select('user_id, full_name, phone_number').eq('user_id', matchedUser.id);
    } else {
      // Search by phone number
      recipientQuery = supabase.from('profiles').select('user_id, full_name, phone_number').eq('phone_number', identifier);
    }

    const { data: recipientProfile, error: recipientError } = await recipientQuery.single();

    if (recipientError || !recipientProfile) {
      return new Response(JSON.stringify({ error: 'Recipient not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (recipientProfile.user_id === user.id) {
      return new Response(JSON.stringify({ error: 'Cannot transfer to yourself' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get sender's wallet
    const { data: senderWallet, error: senderWalletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (senderWalletError || !senderWallet) {
      return new Response(JSON.stringify({ error: 'Sender wallet not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (senderWallet.balance < transferAmount) {
      return new Response(JSON.stringify({ error: 'Insufficient balance' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get recipient's wallet
    const { data: recipientWallet, error: recipientWalletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', recipientProfile.user_id)
      .single();

    if (recipientWalletError || !recipientWallet) {
      return new Response(JSON.stringify({ error: 'Recipient wallet not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reference = `TRF-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Debit sender
    const senderNewBalance = parseFloat(senderWallet.balance) - transferAmount;
    await supabase
      .from('wallets')
      .update({ balance: senderNewBalance, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    // Credit recipient
    const recipientNewBalance = parseFloat(recipientWallet.balance) + transferAmount;
    await supabase
      .from('wallets')
      .update({ balance: recipientNewBalance, updated_at: new Date().toISOString() })
      .eq('user_id', recipientProfile.user_id);

    // Create sender transaction (debit)
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'transfer',
      amount: -transferAmount,
      balance_before: senderWallet.balance,
      balance_after: senderNewBalance,
      status: 'success',
      reference,
      description: description || `Transfer to ${recipientProfile.full_name || recipientProfile.phone_number}`,
      metadata: { recipient_id: recipientProfile.user_id, recipient_name: recipientProfile.full_name }
    });

    // Create recipient transaction (credit)
    await supabase.from('transactions').insert({
      user_id: recipientProfile.user_id,
      type: 'credit',
      amount: transferAmount,
      balance_before: recipientWallet.balance,
      balance_after: recipientNewBalance,
      status: 'success',
      reference,
      description: `Transfer from ${user.email}`,
      metadata: { sender_id: user.id, sender_email: user.email }
    });

    // Create notifications
    await supabase.from('notifications').insert([
      {
        user_id: user.id,
        title: 'Transfer Successful',
        message: `You sent ₦${transferAmount.toLocaleString()} to ${recipientProfile.full_name || recipientProfile.phone_number}`,
        type: 'success'
      },
      {
        user_id: recipientProfile.user_id,
        title: 'Money Received',
        message: `You received ₦${transferAmount.toLocaleString()} from ${user.email}`,
        type: 'success'
      }
    ]);

    console.log(`Transfer successful: ${user.id} -> ${recipientProfile.user_id}, Amount: ${transferAmount}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Transfer successful',
      data: {
        amount: transferAmount,
        recipient: recipientProfile.full_name || recipientProfile.phone_number,
        reference,
        new_balance: senderNewBalance
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Transfer error:', error);
    return new Response(JSON.stringify({ error: 'Transfer failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
