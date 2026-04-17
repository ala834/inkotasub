// Sync Flowpay data plans into service_plans
// Flowpay does NOT expose a plans API — catalog is maintained locally below.
// Admins can edit prices/enable status afterwards in Admin → Services → Data Plans.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Network code → name mapping (Flowpay uses numeric codes)
const NETWORK_NAMES: Record<number, string> = {
  1: "MTN",
  2: "AIRTEL",
  3: "GLO",
  4: "9MOBILE",
};

// Local Flowpay plan catalog. Edit/extend as Flowpay publishes new plans.
// type values: SME | GIFTING | CORPORATE
interface FlowpayPlan {
  plan_id: string;
  network: number;
  plan_name: string;
  price: number;
  validity: string;
  type: "SME" | "GIFTING" | "CORPORATE";
}

const FLOWPAY_PLANS: FlowpayPlan[] = [
  // ===== MTN SME =====
  { plan_id: "MTN_SME_500MB", network: 1, plan_name: "500MB SME", price: 350, validity: "30 days", type: "SME" },
  { plan_id: "MTN_SME_1GB",   network: 1, plan_name: "1GB SME",   price: 500, validity: "30 days", type: "SME" },
  { plan_id: "MTN_SME_2GB",   network: 1, plan_name: "2GB SME",   price: 800, validity: "30 days", type: "SME" },
  { plan_id: "MTN_SME_3GB",   network: 1, plan_name: "3GB SME",   price: 1200, validity: "30 days", type: "SME" },
  { plan_id: "MTN_SME_5GB",   network: 1, plan_name: "5GB SME",   price: 2000, validity: "30 days", type: "SME" },
  // ===== MTN GIFTING =====
  { plan_id: "MTN_GIFT_1GB", network: 1, plan_name: "1GB Gifting", price: 550, validity: "30 days", type: "GIFTING" },
  { plan_id: "MTN_GIFT_2GB", network: 1, plan_name: "2GB Gifting", price: 900, validity: "30 days", type: "GIFTING" },
  { plan_id: "MTN_GIFT_5GB", network: 1, plan_name: "5GB Gifting", price: 2200, validity: "30 days", type: "GIFTING" },
  // ===== MTN CORPORATE =====
  { plan_id: "MTN_CORP_1GB",  network: 1, plan_name: "1GB Corporate Gifting",  price: 480, validity: "30 days", type: "CORPORATE" },
  { plan_id: "MTN_CORP_2GB",  network: 1, plan_name: "2GB Corporate Gifting",  price: 780, validity: "30 days", type: "CORPORATE" },
  { plan_id: "MTN_CORP_5GB",  network: 1, plan_name: "5GB Corporate Gifting",  price: 1900, validity: "30 days", type: "CORPORATE" },
  { plan_id: "MTN_CORP_10GB", network: 1, plan_name: "10GB Corporate Gifting", price: 3700, validity: "30 days", type: "CORPORATE" },

  // ===== AIRTEL SME =====
  { plan_id: "AIRTEL_SME_500MB", network: 2, plan_name: "500MB SME", price: 350, validity: "30 days", type: "SME" },
  { plan_id: "AIRTEL_SME_1GB",   network: 2, plan_name: "1GB SME",   price: 500, validity: "30 days", type: "SME" },
  { plan_id: "AIRTEL_SME_2GB",   network: 2, plan_name: "2GB SME",   price: 800, validity: "30 days", type: "SME" },
  // ===== AIRTEL GIFTING =====
  { plan_id: "AIRTEL_GIFT_1GB", network: 2, plan_name: "1GB Gifting", price: 550, validity: "30 days", type: "GIFTING" },
  { plan_id: "AIRTEL_GIFT_2GB", network: 2, plan_name: "2GB Gifting", price: 1000, validity: "30 days", type: "GIFTING" },
  { plan_id: "AIRTEL_GIFT_5GB", network: 2, plan_name: "5GB Gifting", price: 2400, validity: "30 days", type: "GIFTING" },
  // ===== AIRTEL CORPORATE =====
  { plan_id: "AIRTEL_CORP_1GB", network: 2, plan_name: "1GB Corporate Gifting", price: 480, validity: "30 days", type: "CORPORATE" },
  { plan_id: "AIRTEL_CORP_2GB", network: 2, plan_name: "2GB Corporate Gifting", price: 780, validity: "30 days", type: "CORPORATE" },
  { plan_id: "AIRTEL_CORP_5GB", network: 2, plan_name: "5GB Corporate Gifting", price: 1900, validity: "30 days", type: "CORPORATE" },

  // ===== GLO SME =====
  { plan_id: "GLO_SME_1GB", network: 3, plan_name: "1GB SME", price: 460, validity: "30 days", type: "SME" },
  { plan_id: "GLO_SME_2GB", network: 3, plan_name: "2GB SME", price: 900, validity: "30 days", type: "SME" },
  // ===== GLO GIFTING =====
  { plan_id: "GLO_GIFT_1GB", network: 3, plan_name: "1GB Gifting", price: 500, validity: "30 days", type: "GIFTING" },
  { plan_id: "GLO_GIFT_2GB", network: 3, plan_name: "2GB Gifting", price: 950, validity: "30 days", type: "GIFTING" },
  // ===== GLO CORPORATE =====
  { plan_id: "GLO_CORP_1GB", network: 3, plan_name: "1GB Corporate Gifting", price: 440, validity: "30 days", type: "CORPORATE" },
  { plan_id: "GLO_CORP_2GB", network: 3, plan_name: "2GB Corporate Gifting", price: 850, validity: "30 days", type: "CORPORATE" },

  // ===== 9MOBILE SME =====
  { plan_id: "9MOBILE_SME_1GB", network: 4, plan_name: "1GB SME", price: 800, validity: "30 days", type: "SME" },
  // ===== 9MOBILE GIFTING =====
  { plan_id: "9MOBILE_GIFT_1GB", network: 4, plan_name: "1GB Gifting", price: 850, validity: "30 days", type: "GIFTING" },
  { plan_id: "9MOBILE_GIFT_2GB", network: 4, plan_name: "2GB Gifting", price: 1500, validity: "30 days", type: "GIFTING" },
  // ===== 9MOBILE CORPORATE =====
  { plan_id: "9MOBILE_CORP_1GB", network: 4, plan_name: "1GB Corporate Gifting", price: 780, validity: "30 days", type: "CORPORATE" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: hasAdmin } = await adminSupabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date().toISOString();
    const rows = FLOWPAY_PLANS.map((p) => {
      const networkName = NETWORK_NAMES[p.network] || `NETWORK_${p.network}`;
      return {
        service_type: "data",
        provider: "flowpay",
        network: networkName,
        plan_id: p.plan_id,
        plan_name: p.plan_name,
        plan_type: p.type, // SME | GIFTING | CORPORATE
        base_price: p.price,
        selling_price: p.price,
        validity: p.validity,
        is_enabled: true,
        is_manual: false,
        last_synced_at: now,
        updated_at: now,
      };
    });

    // Upsert by (provider, network, plan_id) — fall back to plan_id if no composite key
    let synced = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (const row of rows) {
      const { data: existing } = await adminSupabase
        .from("service_plans")
        .select("id, base_price, selling_price, is_enabled, is_manual")
        .eq("provider", "flowpay")
        .eq("network", row.network)
        .eq("plan_id", row.plan_id)
        .maybeSingle();

      if (existing) {
        // Preserve admin-edited price + enabled flag if marked manual
        const updatePayload: Record<string, unknown> = {
          plan_name: row.plan_name,
          plan_type: row.plan_type,
          validity: row.validity,
          last_synced_at: now,
          updated_at: now,
        };
        if (!existing.is_manual) {
          updatePayload.base_price = row.base_price;
          updatePayload.selling_price = row.selling_price;
        }
        const { error } = await adminSupabase.from("service_plans").update(updatePayload).eq("id", existing.id);
        if (error) { errors++; errorMessages.push(`${row.plan_id}: ${error.message}`); } else { synced++; }
      } else {
        const { error } = await adminSupabase.from("service_plans").insert(row);
        if (error) { errors++; errorMessages.push(`${row.plan_id}: ${error.message}`); } else { synced++; }
      }
    }

    // Group counts for response summary
    const byType = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.plan_type] = (acc[r.plan_type] || 0) + 1; return acc;
    }, {});
    const byNetwork = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.network] = (acc[r.network] || 0) + 1; return acc;
    }, {});

    console.log(`Flowpay sync complete: ${synced} synced, ${errors} errors`);

    return new Response(JSON.stringify({
      success: errors === 0,
      message: `Synced ${synced} Flowpay plans${errors ? ` (${errors} errors)` : ""}`,
      total: rows.length,
      synced,
      errors,
      errorMessages: errorMessages.slice(0, 10),
      summary: { by_type: byType, by_network: byNetwork },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("sync-flowpay-plans error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
