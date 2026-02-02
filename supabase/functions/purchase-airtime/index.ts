import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Provider API functions
async function subpadiPurchaseAirtime(network: string, phone: string, amount: number) {
  const apiKey = Deno.env.get("SUBPADI_API_KEY");
  const apiToken = Deno.env.get("SUBPADI_API_TOKEN");

  if (!apiKey || !apiToken) {
    return { success: false, message: "SUBPADI credentials not configured", provider: 'subpadi' };
  }

  try {
    const response = await fetch("https://subpadi.com/api/airtime", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        network: network.toUpperCase(),
        phone,
        amount,
      }),
    });

    const data = await response.json();
    const success = data?.status === "success" || data?.code === "000";
    console.log("SUBPADI Airtime Response:", data);
    
    return { success, message: data?.message || (success ? "Success" : "Failed"), data, provider: 'subpadi' };
  } catch (error) {
    console.error("SUBPADI Airtime Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", provider: 'subpadi' };
  }
}

async function smeplugPurchaseAirtime(network: string, phone: string, amount: number) {
  const apiKey = Deno.env.get("SMEPLUG_API_KEY");

  if (!apiKey) {
    return { success: false, message: "SMEPlug credentials not configured", provider: 'smeplug' };
  }

  const networkMap: Record<string, number> = { 'MTN': 1, 'GLO': 2, 'AIRTEL': 3, '9MOBILE': 4, 'ETISALAT': 4 };
  const networkId = networkMap[network.toUpperCase()];
  
  if (!networkId) {
    return { success: false, message: "Invalid network", provider: 'smeplug' };
  }

  try {
    const response = await fetch("https://smeplug.ng/api/v1/airtime/purchase", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ network_id: networkId, phone, amount }),
    });

    const data = await response.json();
    const success = data?.status === "success" || data?.success === true;
    console.log("SMEPlug Airtime Response:", data);
    
    return { success, message: data?.message || (success ? "Success" : "Failed"), data, provider: 'smeplug' };
  } catch (error) {
    console.error("SMEPlug Airtime Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", provider: 'smeplug' };
  }
}

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
    const { network, phoneNumber, amount, transactionPin } = await req.json();

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user profile and validate PIN
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("is_agent, transaction_pin, failed_pin_attempts, pin_locked_until")
      .eq("user_id", userId)
      .single();
    
    if (profile?.pin_locked_until && new Date(profile.pin_locked_until) > new Date()) {
      return new Response(
        JSON.stringify({ error: "Account locked due to too many failed PIN attempts.", success: false }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile?.transaction_pin) {
      if (!transactionPin) {
        return new Response(
          JSON.stringify({ error: "Transaction PIN required", requiresPin: true, success: false }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (profile.transaction_pin !== transactionPin) {
        const newAttempts = (profile.failed_pin_attempts || 0) + 1;
        const lockUntil = newAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
        
        await adminSupabase.from("profiles")
          .update({ failed_pin_attempts: newAttempts, pin_locked_until: lockUntil })
          .eq("user_id", userId);

        return new Response(
          JSON.stringify({ 
            error: newAttempts >= 5 ? "Account locked for 30 minutes" : "Invalid transaction PIN", 
            attemptsRemaining: Math.max(0, 5 - newAttempts),
            success: false 
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (profile.failed_pin_attempts > 0) {
        await adminSupabase.from("profiles")
          .update({ failed_pin_attempts: 0, pin_locked_until: null })
          .eq("user_id", userId);
      }
    }

    const isAgent = profile?.is_agent || false;
    const userType = isAgent ? 'agent' : 'user';

    // Get provider config for this service/network
    const { data: providerConfig } = await adminSupabase
      .from("provider_config")
      .select("*")
      .eq("service_type", "airtime")
      .eq("network", network.toUpperCase())
      .eq("is_active", true)
      .single();

    const primaryProvider = providerConfig?.primary_provider || 'subpadi';
    const fallbackProvider = providerConfig?.fallback_provider || 'smeplug';
    const fallbackEnabled = providerConfig?.fallback_enabled ?? true;

    // Get pricing config
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "airtime")
      .eq("is_active", true)
      .eq("user_type", userType);

    const config = pricingConfigs?.find(c => c.network === network.toUpperCase() && !c.plan_id) 
      || pricingConfigs?.find(c => !c.network && !c.plan_id);

    let costPrice = amount;
    const sellingPrice = amount;
    
    if (config) {
      if (config.profit_type === 'percentage') {
        costPrice = Math.round(amount / (1 + config.profit_value / 100));
      } else {
        costPrice = amount - config.profit_value;
      }
    }

    const profit = sellingPrice - costPrice;

    // Check wallet balance
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

    const reference = `AIR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newBalance = currentBalance - sellingPrice;

    // Create pending transaction
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

    // Try primary provider
    let apiResult = primaryProvider === 'subpadi' 
      ? await subpadiPurchaseAirtime(network, phoneNumber, costPrice)
      : await smeplugPurchaseAirtime(network, phoneNumber, costPrice);

    let usedProvider = primaryProvider;
    let fallbackAttempted = false;
    let fallbackResponse = null;

    // If primary fails and fallback is enabled, try fallback
    if (!apiResult.success && fallbackEnabled && fallbackProvider) {
      console.log(`Primary provider (${primaryProvider}) failed, trying fallback (${fallbackProvider})...`);
      fallbackAttempted = true;
      fallbackResponse = apiResult.data;
      
      apiResult = fallbackProvider === 'subpadi'
        ? await subpadiPurchaseAirtime(network, phoneNumber, costPrice)
        : await smeplugPurchaseAirtime(network, phoneNumber, costPrice);
      
      if (apiResult.success) {
        usedProvider = fallbackProvider;
      }
    }

    if (apiResult.success) {
      // Deduct wallet and mark success
      await adminSupabase.from("wallets")
        .update({ balance: newBalance })
        .eq("user_id", userId);

      await adminSupabase.from("transactions")
        .update({ status: "success" })
        .eq("id", transaction.id);

      // Create VTU order with provider tracking
      await adminSupabase.from("vtu_orders").insert({
        user_id: userId,
        transaction_id: transaction.id,
        service_type: "airtime",
        provider: network.toUpperCase(),
        recipient: phoneNumber,
        amount: sellingPrice,
        cost_price: costPrice,
        profit,
        status: "success",
        api_response: apiResult.data,
        provider_used: usedProvider,
        fallback_attempted: fallbackAttempted,
        fallback_provider: fallbackAttempted ? fallbackProvider : null,
        fallback_response: fallbackResponse,
      });

      return new Response(
        JSON.stringify({ success: true, message: "Airtime purchased successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Both providers failed - mark transaction as failed (no wallet deduction)
      await adminSupabase.from("transactions")
        .update({ status: "failed" })
        .eq("id", transaction.id);

      // Log the failed VTU order
      await adminSupabase.from("vtu_orders").insert({
        user_id: userId,
        transaction_id: transaction.id,
        service_type: "airtime",
        provider: network.toUpperCase(),
        recipient: phoneNumber,
        amount: sellingPrice,
        cost_price: costPrice,
        profit: 0,
        status: "failed",
        api_response: apiResult.data,
        provider_used: usedProvider,
        fallback_attempted: fallbackAttempted,
        fallback_provider: fallbackAttempted ? fallbackProvider : null,
        fallback_response: fallbackResponse,
      });

      return new Response(
        JSON.stringify({ success: false, message: apiResult.message || "Purchase failed on all providers" }),
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
