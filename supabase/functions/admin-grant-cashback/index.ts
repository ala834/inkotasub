import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    const user_id: string | undefined = body.user_id;
    const reason: string | undefined = body.reason?.toString().trim();
    const amount = Number(body.amount);

    if (!user_id || !reason || !Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid input. user_id, amount (>0), and reason required." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (reason.length > 500) {
      return new Response(JSON.stringify({ error: "Reason too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, balance")
      .eq("user_id", user_id)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ error: "User wallet not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const balanceBefore = parseFloat(wallet.balance as unknown as string);

    // Atomic credit
    const { data: newBalance, error: creditError } = await supabase.rpc(
      "atomic_wallet_credit",
      { p_user_id: user_id, p_amount: amount }
    );

    if (creditError) {
      console.error("Cashback credit failed:", creditError);
      return new Response(JSON.stringify({ error: "Failed to credit wallet" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const balanceAfter = parseFloat(newBalance as unknown as string);
    const reference = `CASHBACK_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    // Record cashback
    const { data: cashback, error: cashbackError } = await supabase
      .from("cashback_transactions")
      .insert({
        user_id,
        admin_id: user.id,
        amount,
        reason,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reference,
      })
      .select("id")
      .single();

    if (cashbackError) {
      console.error("Cashback log error:", cashbackError);
    }

    // Notification
    await supabase.from("notifications").insert({
      user_id,
      title: "Cashback Received 🎉",
      message: `You received a cashback of ₦${amount.toLocaleString()}. ${reason}`,
      type: "success",
    });

    // Admin activity log
    await supabase.from("admin_activity_log").insert({
      admin_id: user.id,
      action: "cashback_credit",
      target_user_id: user_id,
      target_type: "wallet",
      target_id: wallet.id,
      details: {
        amount,
        reason,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reference,
        cashback_id: cashback?.id,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          cashback_id: cashback?.id,
          reference,
          amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("admin-grant-cashback error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
