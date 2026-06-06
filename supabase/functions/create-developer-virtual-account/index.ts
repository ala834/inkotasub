// Create a dedicated virtual account for the Developer (API) Wallet.
// Uses a separate Paystack customer (synthetic +dev email) so the user
// can keep their main DVA alongside a dedicated developer DVA.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WALLET_TYPE = "developer";

function devEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  // Avoid double-prefixing
  if (local.endsWith("+dev")) return email;
  return `${local}+dev@${domain}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Must be an approved developer
    const { data: approved } = await supabase.rpc("is_developer_api_approved", { _user_id: user.id });
    if (!approved) {
      return new Response(JSON.stringify({
        success: false,
        error: "You are not approved for Developer API access yet.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Return existing developer VA if present
    const { data: existing } = await supabase
      .from("virtual_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("wallet_type", WALLET_TYPE)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ success: true, account: existing, message: "Already exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Need profile name & phone
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone_number")
      .eq("user_id", user.id)
      .single();

    const fullName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Developer";
    const phone = profile?.phone_number || "";
    if (!phone) {
      return new Response(JSON.stringify({
        success: false,
        error: "Please add your phone number in your profile before creating a developer virtual account.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parts = fullName.split(/\s+/);
    const firstName = "InkotaSub Dev";
    const lastName = parts.join(" ") || fullName;

    const synthEmail = devEmail(user.email!);

    // Find or create a separate Paystack customer for the developer wallet
    let customerCode = "";
    const listRes = await fetch(
      `https://api.paystack.co/customer?email=${encodeURIComponent(synthEmail)}`,
      { headers: { Authorization: `Bearer ${paystackSecretKey}` } },
    );
    const listData = await listRes.json();
    const matched = (listData?.data || []).find((c: any) => c.metadata?.user_id === user.id && c.metadata?.wallet_type === WALLET_TYPE)
      ?? (listData?.data || [])[0];

    if (matched) {
      customerCode = matched.customer_code;
    } else {
      const createRes = await fetch("https://api.paystack.co/customer", {
        method: "POST",
        headers: { Authorization: `Bearer ${paystackSecretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: synthEmail,
          first_name: firstName,
          last_name: lastName,
          phone,
          metadata: { user_id: user.id, wallet_type: WALLET_TYPE },
        }),
      });
      const createData = await createRes.json();
      if (!createData.status) {
        console.error("Failed to create Paystack dev customer:", createData);
        throw new Error(createData.message || "Failed to create customer");
      }
      customerCode = createData.data.customer_code;
    }

    // Sync customer details
    await fetch(`https://api.paystack.co/customer/${customerCode}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${paystackSecretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        phone,
        metadata: { user_id: user.id, wallet_type: WALLET_TYPE },
      }),
    });

    // Create DVA
    const dvaRes = await fetch("https://api.paystack.co/dedicated_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackSecretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ customer: customerCode, preferred_bank: "wema-bank" }),
    });
    const dvaData = await dvaRes.json();
    console.log("Paystack DVA (dev) response:", JSON.stringify(dvaData));

    let dva: any = null;

    if (dvaData.status) {
      dva = dvaData.data;
    } else if (dvaData.message?.includes("Dedicated NUBAN is not available") || dvaData.code === "feature_unavailable") {
      return new Response(JSON.stringify({
        success: false, unavailable: true,
        error: "Virtual accounts are not yet available on this Paystack business.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else if (dvaData.message?.includes("already has a dedicated")) {
      const fetchRes = await fetch(
        `https://api.paystack.co/dedicated_account?customer=${customerCode}`,
        { headers: { Authorization: `Bearer ${paystackSecretKey}` } },
      );
      const fetchData = await fetchRes.json();
      dva = (fetchData?.data || [])[0];
    }

    if (!dva) {
      throw new Error(dvaData.message || "Failed to create developer virtual account");
    }

    const { data: saved, error: saveError } = await supabase
      .from("virtual_accounts")
      .insert({
        user_id: user.id,
        wallet_type: WALLET_TYPE,
        account_number: dva.account_number,
        account_name: dva.account_name,
        bank_name: dva.bank.name,
        bank_code: dva.bank.slug,
        customer_code: customerCode,
        customer_id: dva.customer?.id?.toString(),
        dva_id: dva.id?.toString(),
        is_active: dva.active ?? true,
        metadata: { paystack_response: dva, synth_email: synthEmail },
      })
      .select()
      .single();

    if (saveError) {
      console.error("Save dev VA error:", saveError);
      throw saveError;
    }

    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Developer Virtual Account Ready",
      message: `Your developer account ${saved.account_number} (${saved.bank_name}) is ready for funding.`,
      type: "success",
    });

    return new Response(JSON.stringify({ success: true, account: saved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-developer-virtual-account error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to create developer virtual account",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
