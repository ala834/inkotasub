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
    const { network, phoneNumber, amount } = await req.json();

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

    // Get pricing config for airtime
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "airtime")
      .eq("is_active", true)
      .eq("user_type", userType);

    // Find applicable pricing config
    const config = pricingConfigs?.find(
      c => c.network === network.toUpperCase() && !c.plan_id
    ) || pricingConfigs?.find(
      c => !c.network && !c.plan_id
    );

    // Calculate cost price (what we pay SUBPADI)
    let costPrice = amount;
    let sellingPrice = amount;
    
    if (config) {
      if (config.profit_type === 'percentage') {
        // amount is the selling price, calculate cost price
        costPrice = Math.round(amount / (1 + config.profit_value / 100));
      } else {
        costPrice = amount - config.profit_value;
      }
    }

    const profit = sellingPrice - costPrice;

    // Get wallet balance
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (walletError || !wallet) {
      throw new Error("Wallet not found");
    }

    const currentBalance = parseFloat(wallet.balance as unknown as string);
    if (currentBalance < sellingPrice) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reference = `AIR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newBalance = currentBalance - sellingPrice;

    // Create transaction first
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
        description: `${network.toUpperCase()} Airtime - ${phoneNumber}`,
      })
      .select()
      .single();

    if (txError) throw txError;

    // Call SUBPADI API
    const subpadiApiKey = Deno.env.get("SUBPADI_API_KEY");
    const subpadiToken = Deno.env.get("SUBPADI_API_TOKEN");

    let apiSuccess = false;
    let apiResponse = null;

    try {
      const response = await fetch("https://subpadi.com/api/airtime", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${subpadiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: subpadiApiKey,
          network: network.toUpperCase(),
          phone: phoneNumber,
          amount: costPrice, // Send cost price to SUBPADI
        }),
      });

      apiResponse = await response.json();
      apiSuccess = apiResponse?.status === "success" || apiResponse?.code === "000";
      console.log("SUBPADI response:", apiResponse);
    } catch (apiError: unknown) {
      console.error("SUBPADI API error:", apiError);
      apiResponse = { error: apiError instanceof Error ? apiError.message : "API error" };
    }

    if (apiSuccess) {
      // Deduct from wallet and mark success
      await adminSupabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("user_id", userId);

      await adminSupabase
        .from("transactions")
        .update({ status: "success" })
        .eq("id", transaction.id);

      // Create VTU order with profit tracking
      await adminSupabase.from("vtu_orders").insert({
        user_id: userId,
        transaction_id: transaction.id,
        service_type: "airtime",
        provider: network.toUpperCase(),
        recipient: phoneNumber,
        amount: sellingPrice,
        cost_price: costPrice,
        profit: profit,
        status: "success",
        api_response: apiResponse,
      });

      return new Response(
        JSON.stringify({ success: true, message: "Airtime purchased successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Mark transaction as failed
      await adminSupabase
        .from("transactions")
        .update({ status: "failed" })
        .eq("id", transaction.id);

      return new Response(
        JSON.stringify({ success: false, message: apiResponse?.message || "Purchase failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});