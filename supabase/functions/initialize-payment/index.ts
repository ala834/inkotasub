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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const { amount, email, paymentMethod } = await req.json();

    if (!amount || amount < 100) {
      return new Response(
        JSON.stringify({ error: "Minimum amount is ₦100" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reference = `INK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Determine payment channels based on selected method
      let channels: string[];
      if (paymentMethod === "bank") {
        channels = ["bank_transfer", "bank", "ussd"];
      } else if (paymentMethod === "ussd") {
        channels = ["ussd"];
      } else {
        channels = ["card"];
      }

      // Initialize Paystack transaction
      const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // Paystack expects amount in kobo
          email,
          reference,
          callback_url: `${Deno.env.get("APP_URL") ?? "https://inkotasub.com"}/payment-callback`,
          channels,
          metadata: {
            user_id: userId,
            payment_method: paymentMethod,
            custom_fields: [
              { display_name: "User ID", variable_name: "user_id", value: userId },
              { display_name: "Payment Method", variable_name: "payment_method", value: paymentMethod },
            ],
          },
        }),
      });

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      console.error("Paystack error:", paystackData);
      throw new Error(paystackData.message || "Failed to initialize payment");
    }

    // Create pending transaction
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "credit",
      amount,
      balance_before: 0,
      balance_after: 0,
      status: "pending",
      reference,
      description: "Wallet funding",
      metadata: { paystack_reference: paystackData.data.reference },
    });

    console.log("Payment initialized:", reference);

    return new Response(
      JSON.stringify({
        authorization_url: paystackData.data.authorization_url,
        reference: paystackData.data.reference,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
