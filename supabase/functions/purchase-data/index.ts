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
    const { network, phoneNumber, planId, amount } = await req.json();

    // Get wallet balance
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (!wallet) throw new Error("Wallet not found");

    const currentBalance = parseFloat(wallet.balance as unknown as string);
    if (currentBalance < amount) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reference = `DATA_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newBalance = currentBalance - amount;

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create transaction
    const { data: transaction, error: txError } = await adminSupabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "debit",
        amount,
        balance_before: currentBalance,
        balance_after: newBalance,
        status: "pending",
        reference,
        description: `${network.toUpperCase()} Data - ${phoneNumber}`,
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
      const response = await fetch("https://subpadi.com/api/data", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${subpadiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: subpadiApiKey,
          network: network.toUpperCase(),
          phone: phoneNumber,
          plan_id: planId,
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
        service_type: "data",
        provider: network.toUpperCase(),
        recipient: phoneNumber,
        amount,
        status: "success",
        api_response: apiResponse,
      });

      return new Response(
        JSON.stringify({ success: true, message: "Data purchased successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
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
