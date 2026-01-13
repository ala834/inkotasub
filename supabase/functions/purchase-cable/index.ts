import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub;
    const { provider, smartCardNumber, planId, amount, customerName } = await req.json();

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user profile to check if agent
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("is_agent")
      .eq("user_id", userId)
      .single();
    
    const isAgent = profile?.is_agent || false;
    const userType = isAgent ? 'agent' : 'user';

    // Get pricing config for cable
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "cable")
      .eq("is_active", true)
      .eq("user_type", userType);

    // Find applicable pricing config
    const config = pricingConfigs?.find(
      c => c.network === provider.toUpperCase() && c.plan_id === planId
    ) || pricingConfigs?.find(
      c => c.network === provider.toUpperCase() && !c.plan_id
    ) || pricingConfigs?.find(
      c => !c.network && !c.plan_id
    );

    // Calculate cost price
    let costPrice = amount;
    let sellingPrice = amount;
    
    if (config) {
      if (config.profit_type === 'percentage') {
        costPrice = Math.round(amount / (1 + config.profit_value / 100));
      } else {
        costPrice = amount - config.profit_value;
      }
    }

    const profit = sellingPrice - costPrice;

    // Get wallet
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (!wallet) throw new Error("Wallet not found");

    const currentBalance = parseFloat(wallet.balance as unknown as string);
    if (currentBalance < sellingPrice) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reference = `CABLE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newBalance = currentBalance - sellingPrice;

    // Create transaction
    const { data: transaction, error: txError } = await adminSupabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "debit",
        amount: sellingPrice,
        balance_before: currentBalance,
        balance_after: newBalance,
        status: "pending",
        reference,
        description: `${provider.toUpperCase()} Subscription - ${smartCardNumber}`,
      })
      .select()
      .single();

    if (txError) throw txError;

    // Simulate successful subscription
    await adminSupabase
      .from("wallets")
      .update({ balance: newBalance })
      .eq("user_id", userId);

    await adminSupabase
      .from("transactions")
      .update({ status: "success" })
      .eq("id", transaction.id);

    await adminSupabase.from("vtu_orders").insert({
      user_id: userId,
      transaction_id: transaction.id,
      service_type: "cable",
      provider: provider.toUpperCase(),
      recipient: smartCardNumber,
      amount: sellingPrice,
      cost_price: costPrice,
      profit: profit,
      status: "success",
      api_response: { planId, customerName },
    });

    return new Response(
      JSON.stringify({ success: true, message: "Subscription successful" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});