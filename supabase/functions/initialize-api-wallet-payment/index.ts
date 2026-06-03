// Initialize Paystack payment for the Developer (API) Wallet.
// Credits go to api_wallets — completely separate from the main wallet.
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
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const { amount, email } = await req.json();

    if (!amount || Number(amount) < 100) {
      return new Response(
        JSON.stringify({ error: "Minimum amount is ₦100" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify user is an approved developer
    const { data: approved } = await admin.rpc("is_developer_api_approved", { _user_id: userId });
    if (!approved) {
      return new Response(
        JSON.stringify({ error: "You are not approved for Developer API access" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Reference is prefixed so webhooks/verifiers can route to the API wallet
    const reference = `APIW_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(Number(amount) * 100),
        email: email ?? user.email,
        reference,
        callback_url: `${Deno.env.get("APP_URL") ?? "https://inkotasub.com"}/developer?api_wallet_ref=${reference}`,
        channels: ["card", "bank", "ussd", "bank_transfer"],
        metadata: {
          user_id: userId,
          wallet_type: "api_wallet",
          custom_fields: [
            { display_name: "User ID", variable_name: "user_id", value: userId },
            { display_name: "Wallet Type", variable_name: "wallet_type", value: "api_wallet" },
          ],
        },
      }),
    });

    const paystackData = await paystackResponse.json();
    if (!paystackData.status) {
      console.error("Paystack init error:", paystackData);
      throw new Error(paystackData.message || "Failed to initialize payment");
    }

    // Ensure an api_wallet exists for the user
    await admin
      .from("api_wallets")
      .upsert({ user_id: userId, balance: 0 }, { onConflict: "user_id", ignoreDuplicates: true });

    console.log("API wallet payment initialized:", reference, "user:", userId, "amount:", amount);

    return new Response(
      JSON.stringify({
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
        reference: paystackData.data.reference,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("initialize-api-wallet-payment error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
