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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Creating virtual account for user:", user.id);

    // Check if user already has a virtual account
    const { data: existingAccount } = await supabase
      .from("virtual_accounts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (existingAccount) {
      console.log("User already has virtual account:", existingAccount.account_number);
      return new Response(JSON.stringify({ 
        success: true, 
        account: existingAccount,
        message: "Virtual account already exists"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user profile for name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone_number")
      .eq("user_id", user.id)
      .single();

    const customerName = profile?.full_name || user.email?.split("@")[0] || "Customer";
    const customerPhone = profile?.phone_number || "";

    // Step 1: Create or get Paystack customer
    let customerCode = "";
    
    // Check if customer exists on Paystack
    const listCustomersRes = await fetch(
      `https://api.paystack.co/customer?email=${encodeURIComponent(user.email!)}`,
      {
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
        },
      }
    );

    const listCustomersData = await listCustomersRes.json();
    
    if (listCustomersData.data && listCustomersData.data.length > 0) {
      customerCode = listCustomersData.data[0].customer_code;
      console.log("Found existing Paystack customer:", customerCode);
    } else {
      // Create new customer
      const createCustomerRes = await fetch("https://api.paystack.co/customer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          first_name: customerName.split(" ")[0],
          last_name: customerName.split(" ").slice(1).join(" ") || customerName,
          phone: customerPhone,
          metadata: {
            user_id: user.id,
          },
        }),
      });

      const createCustomerData = await createCustomerRes.json();
      
      if (!createCustomerData.status) {
        console.error("Failed to create Paystack customer:", createCustomerData);
        throw new Error(createCustomerData.message || "Failed to create customer");
      }

      customerCode = createCustomerData.data.customer_code;
      console.log("Created new Paystack customer:", customerCode);
    }

    // Step 2: Create Dedicated Virtual Account
    const createDVARes = await fetch("https://api.paystack.co/dedicated_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer: customerCode,
        preferred_bank: "wema-bank", // Wema Bank for instant crediting
      }),
    });

    const createDVAData = await createDVARes.json();
    console.log("Paystack DVA response:", JSON.stringify(createDVAData));

    if (!createDVAData.status) {
      // Check if it's because DVA already exists
      if (createDVAData.message?.includes("already has a dedicated")) {
        // Fetch existing DVA
        const fetchDVARes = await fetch(
          `https://api.paystack.co/dedicated_account?customer=${customerCode}`,
          {
            headers: {
              Authorization: `Bearer ${paystackSecretKey}`,
            },
          }
        );
        
        const fetchDVAData = await fetchDVARes.json();
        
        if (fetchDVAData.data && fetchDVAData.data.length > 0) {
          const dva = fetchDVAData.data[0];
          
          // Save to database
          const { data: savedAccount, error: saveError } = await supabase
            .from("virtual_accounts")
            .insert({
              user_id: user.id,
              account_number: dva.account_number,
              account_name: dva.account_name,
              bank_name: dva.bank.name,
              bank_code: dva.bank.slug,
              customer_code: customerCode,
              dva_id: dva.id?.toString(),
              is_active: dva.active,
              metadata: { paystack_response: dva },
            })
            .select()
            .single();

          if (saveError) {
            console.error("Error saving virtual account:", saveError);
            throw saveError;
          }

          return new Response(JSON.stringify({ 
            success: true, 
            account: savedAccount 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      
      throw new Error(createDVAData.message || "Failed to create virtual account");
    }

    const dva = createDVAData.data;

    // Save virtual account to database
    const { data: savedAccount, error: saveError } = await supabase
      .from("virtual_accounts")
      .insert({
        user_id: user.id,
        account_number: dva.account_number,
        account_name: dva.account_name,
        bank_name: dva.bank.name,
        bank_code: dva.bank.slug,
        customer_code: customerCode,
        customer_id: dva.customer?.id?.toString(),
        dva_id: dva.id?.toString(),
        is_active: dva.active,
        metadata: { paystack_response: dva },
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving virtual account:", saveError);
      throw saveError;
    }

    console.log("Virtual account created successfully:", savedAccount.account_number);

    // Create notification for user
    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Virtual Account Created!",
      message: `Your dedicated account ${savedAccount.account_number} (${savedAccount.bank_name}) is ready for funding.`,
      type: "success",
    });

    return new Response(JSON.stringify({ 
      success: true, 
      account: savedAccount 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Create virtual account error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Failed to create virtual account" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
