import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }
    const { data: { user }, error: aerr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (aerr || !user) return json({ error: "Invalid token" }, 401);

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Invalid amount" }, 400);

    const { data, error } = await supabase.rpc("redeem_cashback_to_wallet", {
      p_user_id: user.id,
      p_amount: amount,
    });

    if (error) {
      const msg = error.message?.includes("insufficient_cashback")
        ? "Insufficient cashback balance"
        : "Failed to redeem cashback";
      return json({ error: msg }, 400);
    }

    return json({ success: true, data });
  } catch (e) {
    console.error("redeem-cashback error:", e);
    return json({ error: "Internal error" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
