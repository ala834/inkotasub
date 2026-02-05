import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
 import {
   purchaseData,
   DEFAULT_PROVIDER_ROUTING,
   generateReference,
   type Provider,
 } from "../_shared/inkota-service-layer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const { network, phoneNumber, planId, amount, transactionPin } = await req.json();

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
      
      // Use secure bcrypt comparison
      const pinValid = await comparePin(transactionPin, profile.transaction_pin);
      
      if (!pinValid) {
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

      // Reset failed attempts on successful PIN and migrate if needed
      const updates: Record<string, any> = { failed_pin_attempts: 0, pin_locked_until: null };
      
      if (needsPinMigration(profile.transaction_pin)) {
        const salt = await bcrypt.genSalt(10);
        updates.transaction_pin = await bcrypt.hash(transactionPin, salt);
        console.log('Migrated legacy PIN to bcrypt hash for user:', userId);
      }

      if (profile.failed_pin_attempts > 0 || needsPinMigration(profile.transaction_pin)) {
        await adminSupabase.from("profiles")
          .update(updates)
          .eq("user_id", userId);
      }
    }

    const isAgent = profile?.is_agent || false;
    const userType = isAgent ? 'agent' : 'user';

     // Get provider config for this service/network (admin can override defaults)
    const { data: providerConfig } = await adminSupabase
      .from("provider_config")
      .select("*")
      .eq("service_type", "data")
      .eq("network", network.toUpperCase())
      .eq("is_active", true)
      .single();

     // Use INKOTA SUB default routing (Data -> SMEPlug primary), allow admin override
     const defaultRouting = DEFAULT_PROVIDER_ROUTING.data;
     const primaryProvider = (providerConfig?.primary_provider || defaultRouting.primary) as Provider;
     const fallbackProvider = (providerConfig?.fallback_provider || defaultRouting.fallback) as Provider;
    const fallbackEnabled = providerConfig?.fallback_enabled ?? true;

    // Get pricing config
    const { data: pricingConfigs } = await adminSupabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "data")
      .eq("is_active", true)
      .eq("user_type", userType);

    const config = pricingConfigs?.find(c => c.network === network.toUpperCase() && c.plan_id === planId)
      || pricingConfigs?.find(c => c.network === network.toUpperCase() && !c.plan_id)
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
         JSON.stringify({ error: "Insufficient balance. Please fund your wallet.", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

     const reference = generateReference('data');
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
        description: `${network.toUpperCase()} Data - ${phoneNumber}`,
      })
      .select()
      .single();

    if (txError) throw txError;

     // Use INKOTA SUB unified service layer with automatic failover
     const apiResult = await purchaseData(
       { network, phoneNumber, planId, amount: costPrice },
       { primary: primaryProvider, fallback: fallbackProvider, fallbackEnabled }
     );
 
     // Extract internal tracking info for admin logging
     const usedProvider = apiResult._internal.providerUsed;
     const fallbackAttempted = apiResult._internal.fallbackAttempted;
     const fallbackResponse = apiResult._internal.fallbackResponse;

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
        service_type: "data",
        provider: network.toUpperCase(),
        recipient: phoneNumber,
        amount: sellingPrice,
        cost_price: costPrice,
        profit,
        status: "success",
         api_response: apiResult._internal.rawResponse,
        provider_used: usedProvider,
        fallback_attempted: fallbackAttempted,
        fallback_provider: fallbackAttempted ? fallbackProvider : null,
        fallback_response: fallbackResponse,
      });

      return new Response(
         JSON.stringify({ success: true, message: apiResult.message }),
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
        service_type: "data",
        provider: network.toUpperCase(),
        recipient: phoneNumber,
        amount: sellingPrice,
        cost_price: costPrice,
        profit: 0,
        status: "failed",
         api_response: apiResult._internal.rawResponse,
        provider_used: usedProvider,
        fallback_attempted: fallbackAttempted,
        fallback_provider: fallbackAttempted ? fallbackProvider : null,
        fallback_response: fallbackResponse,
      });

      return new Response(
         JSON.stringify({ success: false, message: apiResult.message }),
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
