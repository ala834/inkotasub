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

    const authToken = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(authToken);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub;
    const { disco, meterNumber, meterType, amount, customerName } = await req.json();

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

    // Get pricing config for electricity
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "electricity")
      .eq("is_active", true)
      .eq("user_type", userType);

    // Find applicable pricing config
    const config = pricingConfigs?.find(
      c => c.network === disco.toUpperCase() && !c.plan_id
    ) || pricingConfigs?.find(
      c => !c.network && !c.plan_id
    );

    // Calculate selling price (add service fee)
    let costPrice = amount;
    let serviceCharge = 0;
    
    if (config) {
      if (config.profit_type === 'percentage') {
        serviceCharge = Math.round(amount * config.profit_value / 100);
      } else {
        serviceCharge = config.profit_value;
      }
    }

    const sellingPrice = amount + serviceCharge;
    const profit = serviceCharge;

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

    const reference = `ELEC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
        description: `Electricity - ${disco.toUpperCase()} - ${meterNumber}`,
        metadata: { serviceCharge, unitAmount: amount },
      })
      .select()
      .single();

    if (txError) throw txError;

    // Simulate successful purchase and token generation
    const electricityToken = `${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}`;

    // Update wallet and transaction
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
      service_type: "electricity",
      provider: disco.toUpperCase(),
      recipient: meterNumber,
      amount: sellingPrice,
      cost_price: costPrice,
      profit: profit,
      status: "success",
      api_response: { token: electricityToken, customerName, meterType },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        token: electricityToken, 
        message: "Electricity purchased successfully",
        serviceCharge,
        totalAmount: sellingPrice,
      }),
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