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

    // Check if user already has a main virtual account
    const { data: existingAccount } = await supabase
      .from("virtual_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("wallet_type", "main")
      .maybeSingle();

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

    if (!customerPhone) {
      console.log("No phone number found for user, cannot create DVA");
      return new Response(JSON.stringify({ 
        success: false,
        error: "Please add your phone number in your profile before creating a virtual account."
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse user's name properly
    const nameParts = customerName.trim().split(/\s+/);
    const firstName = nameParts[0] || "Customer";
    const lastName = nameParts.slice(1).join(" ") || firstName;

    // Step 1: Create or get Paystack customer
    let customerCode = "";
    
    // Check if we already have a customer_code stored in DB for this user
    const { data: existingVA } = await supabase
      .from("virtual_accounts")
      .select("customer_code")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingVA?.customer_code) {
      customerCode = existingVA.customer_code;
      console.log("Using stored customer_code:", customerCode);
    } else {
      // Look up customer on Paystack by email
      const listCustomersRes = await fetch(
        `https://api.paystack.co/customer?email=${encodeURIComponent(user.email!)}`,
        {
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
          },
        }
      );

      const listCustomersData = await listCustomersRes.json();
      
      // Find a customer that matches this user (check metadata user_id if available)
      let matchedCustomer = null;
      if (listCustomersData.data && listCustomersData.data.length > 0) {
        // Prefer a customer whose metadata.user_id matches
        matchedCustomer = listCustomersData.data.find(
          (c: any) => c.metadata?.user_id === user.id
        );
        // Fallback: if only one customer exists for this email, use it
        if (!matchedCustomer && listCustomersData.data.length === 1) {
          matchedCustomer = listCustomersData.data[0];
        }
      }

      if (matchedCustomer) {
        customerCode = matchedCustomer.customer_code;
        console.log("Found existing Paystack customer:", customerCode);
      } else {
        // Create new customer with correct name
        const createCustomerRes = await fetch("https://api.paystack.co/customer", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: user.email,
            first_name: firstName,
            last_name: lastName,
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
    }

    // Always update Paystack customer with latest name and phone to ensure DVA name matches
    console.log("Syncing customer details:", { firstName, lastName, phone: customerPhone });
    const updateRes = await fetch(
      `https://api.paystack.co/customer/${customerCode}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          phone: customerPhone,
          metadata: { user_id: user.id },
        }),
      }
    );
    const updateData = await updateRes.json();
    console.log("Customer sync response:", updateData.status);

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
      // Check if DVA feature is not available for this business
      if (createDVAData.message?.includes("Dedicated NUBAN is not available") ||
          createDVAData.code === "feature_unavailable") {
        console.log("DVA feature not available for this business");
        return new Response(JSON.stringify({ 
          success: false,
          unavailable: true,
          error: "Virtual accounts are not yet available. Please use card or bank transfer to fund your wallet."
        }), {
          status: 200, // Return 200 so frontend can handle gracefully
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
