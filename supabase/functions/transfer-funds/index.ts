import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Compare PIN with hashed or legacy plaintext support
async function comparePin(plaintextPin: string, hashedPin: string): Promise<boolean> {
  if (!hashedPin.startsWith('$2')) {
    return plaintextPin === hashedPin;
  }
  return await bcrypt.compare(plaintextPin, hashedPin);
}

// Check if PIN needs migration from plaintext to hashed
function needsPinMigration(storedPin: string): boolean {
  return !storedPin.startsWith('$2');
}

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

    const { recipient_identifier, amount, description, transactionPin } = await req.json();

    // Get sender's profile to validate PIN
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('transaction_pin, failed_pin_attempts, pin_locked_until, full_name')
      .eq('user_id', user.id)
      .single();

    // Check PIN lockout
    if (senderProfile?.pin_locked_until && new Date(senderProfile.pin_locked_until) > new Date()) {
      return new Response(
        JSON.stringify({ error: 'Account locked due to too many failed PIN attempts. Try again later.', success: false }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate transaction PIN if set
    if (senderProfile?.transaction_pin) {
      if (!transactionPin) {
        return new Response(
          JSON.stringify({ error: 'Transaction PIN required', requiresPin: true, success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Use secure bcrypt comparison
      const pinValid = await comparePin(transactionPin, senderProfile.transaction_pin);
      
      if (!pinValid) {
        const newAttempts = (senderProfile.failed_pin_attempts || 0) + 1;
        const lockUntil = newAttempts >= 3 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
        
        await supabase
          .from('profiles')
          .update({ failed_pin_attempts: newAttempts, pin_locked_until: lockUntil })
          .eq('user_id', user.id);

        return new Response(
          JSON.stringify({ 
            error: newAttempts >= 3 ? 'Account locked for 30 minutes due to too many failed attempts' : 'Invalid transaction PIN', 
            attemptsRemaining: Math.max(0, 3 - newAttempts),
            success: false 
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Reset failed attempts on successful PIN
      const updates: Record<string, any> = { failed_pin_attempts: 0, pin_locked_until: null };
      
      // Migrate legacy plaintext PIN to hashed
      if (needsPinMigration(senderProfile.transaction_pin)) {
        const salt = await bcrypt.genSalt(10);
        updates.transaction_pin = await bcrypt.hash(transactionPin, salt);
        console.log('Migrated legacy PIN to bcrypt hash for user:', user.id);
      }

      if (senderProfile.failed_pin_attempts > 0 || needsPinMigration(senderProfile.transaction_pin)) {
        await supabase
          .from('profiles')
          .update(updates)
          .eq('user_id', user.id);
      }
    }

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

    if (transferAmount < 100) {
      return new Response(JSON.stringify({ error: 'Minimum transfer amount is ₦100' }), {
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

    const currentBalance = parseFloat(senderWallet.balance);
    if (currentBalance < transferAmount) {
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

    const reference = `TRF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check for duplicate transaction
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('reference', reference)
      .single();

    if (existingTx) {
      return new Response(JSON.stringify({ error: 'Duplicate transaction detected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Debit sender
    const senderNewBalance = currentBalance - transferAmount;
    await supabase
      .from('wallets')
      .update({ balance: senderNewBalance, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    // Credit recipient
    const recipientCurrentBalance = parseFloat(recipientWallet.balance);
    const recipientNewBalance = recipientCurrentBalance + transferAmount;
    await supabase
      .from('wallets')
      .update({ balance: recipientNewBalance, updated_at: new Date().toISOString() })
      .eq('user_id', recipientProfile.user_id);

    const senderName = senderProfile?.full_name || user.email;

    // Create sender transaction (debit)
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'debit',
      amount: transferAmount,
      balance_before: currentBalance,
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
      balance_before: recipientCurrentBalance,
      balance_after: recipientNewBalance,
      status: 'success',
      reference,
      description: `Transfer from ${senderName}`,
      metadata: { sender_id: user.id, sender_name: senderName }
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
        message: `You received ₦${transferAmount.toLocaleString()} from ${senderName}`,
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
