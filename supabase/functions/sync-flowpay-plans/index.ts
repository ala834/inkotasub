// Sync Flowpay data plans into flowpay_manual_plans by fetching the
// live catalog from Flowpay's GET /api/data_plans endpoint.
//
// Behaviour:
//  - Pulls every ACTIVE data_plan from every ACTIVE plan_type / network.
//  - INSERT new plans with api_plan_id = Flowpay numeric id (used at purchase time).
//  - UPDATE existing plans (matched by network + api_plan_id) — refreshes
//    plan_name / plan_type / validity ONLY; preserves admin-edited price + is_enabled.
//  - Returns a detailed report including any IDs that exist on Flowpay
//    but were missing locally before the sync.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FLOWPAY_PLANS_URL = "https://app.flowpay.ng/api/data_plans";

// Flowpay network id → canonical name
const NETWORK_NAMES: Record<number, string> = {
  1: "MTN",
  2: "AIRTEL",
  3: "GLO",
  4: "9MOBILE",
};

interface FlowpayApiPlan {
  id: number;
  active: number;
  plan_size: number | null;
  plan_volume: string | null; // 'mb' | 'gb' | null
  plan_validity: string | null;
  amount: string;          // provider cost
  purchase_price: string;  // suggested user price (face value)
  user_amount?: string;
  network: string;
  network_id: number;
  plan_type: string;
}

function buildPlanName(p: FlowpayApiPlan): string {
  const size = p.plan_size;
  const vol = (p.plan_volume || "").toUpperCase();
  const type = (p.plan_type || "").toUpperCase().trim();
  if (size && vol) return `${size}${vol} ${type}`.trim();
  // No size info — label by face-value amount so it remains identifiable.
  const amount = Number(p.purchase_price || p.amount || 0);
  return `${type} ₦${amount.toLocaleString()}`.trim();
}

function normalisePrice(p: FlowpayApiPlan): number {
  // Face-value delivery: charge user the purchase_price advertised by Flowpay.
  const raw = Number(p.purchase_price || p.user_amount || p.amount || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: hasAdmin } = await adminSupabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("FLOWPAY_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "FLOWPAY_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch live catalog from Flowpay
    const fpRes = await fetch(FLOWPAY_PLANS_URL, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });
    const fpText = await fpRes.text();
    if (!fpRes.ok) {
      return new Response(JSON.stringify({
        error: `Flowpay /data_plans returned HTTP ${fpRes.status}`,
        body: fpText.slice(0, 500),
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let fpData: any;
    try { fpData = JSON.parse(fpText); } catch {
      return new Response(JSON.stringify({ error: "Flowpay returned non-JSON" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Flatten — every active data_plan inside every active plan_type
    const allPlans: FlowpayApiPlan[] = [];
    for (const net of (fpData?.mobile_networks ?? [])) {
      const netName = NETWORK_NAMES[net.id] || String(net.name || "").toUpperCase();
      for (const pt of (net.plan_types ?? [])) {
        if (pt.active !== 1) continue;
        for (const p of (pt.data_plans ?? [])) {
          if (p.active !== 1) continue;
          allPlans.push({ ...p, network: netName, network_id: net.id, plan_type: pt.name });
        }
      }
    }

    // 3. Snapshot existing rows so we can report which IDs were missing
    const { data: existingRows } = await adminSupabase
      .from("flowpay_manual_plans")
      .select("id, network, api_plan_id, price, is_enabled");

    const existingByKey = new Map<string, { id: string; price: number; is_enabled: boolean }>();
    for (const row of existingRows ?? []) {
      if (row.api_plan_id) {
        existingByKey.set(`${row.network}:${row.api_plan_id}`, {
          id: row.id, price: Number(row.price), is_enabled: row.is_enabled,
        });
      }
    }

    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];
    const previouslyMissing: Array<{ id: number; network: string; plan_type: string; price: number; name: string }> = [];

    for (const p of allPlans) {
      const key = `${p.network}:${p.id}`;
      const price = normalisePrice(p);
      if (price <= 0) continue;

      const planName = buildPlanName(p);
      const validity = (p.plan_validity || "30 DAYS").trim();
      const planType = (p.plan_type || "").toUpperCase().trim() || "SME";

      const existing = existingByKey.get(key);
      if (existing) {
        // Preserve admin price + enabled flag. Refresh metadata only.
        const { error } = await adminSupabase.from("flowpay_manual_plans").update({
          plan_name: planName,
          plan_type: planType,
          validity,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
        if (error) errors.push(`update ${key}: ${error.message}`);
        else updated++;
      } else {
        const { error } = await adminSupabase.from("flowpay_manual_plans").insert({
          network: p.network,
          plan_name: planName,
          price,
          api_plan_id: String(p.id),
          plan_type: planType,
          validity,
          is_enabled: true,
        });
        if (error) errors.push(`insert ${key}: ${error.message}`);
        else {
          inserted++;
          previouslyMissing.push({
            id: p.id, network: p.network, plan_type: planType, price, name: planName,
          });
        }
      }
    }

    // Group totals for the report
    const byNetwork: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const p of allPlans) {
      byNetwork[p.network] = (byNetwork[p.network] || 0) + 1;
      const t = (p.plan_type || "").toUpperCase();
      byType[t] = (byType[t] || 0) + 1;
    }

    console.log(`Flowpay sync: ${allPlans.length} active plans on Flowpay → inserted ${inserted}, updated ${updated}, errors ${errors.length}`);

    return new Response(JSON.stringify({
      success: errors.length === 0,
      message: `Synced ${inserted + updated} Flowpay plans (${inserted} new, ${updated} refreshed)`,
      flowpay_active_plans: allPlans.length,
      inserted,
      updated,
      errors: errors.length,
      error_samples: errors.slice(0, 10),
      previously_missing_count: previouslyMissing.length,
      previously_missing: previouslyMissing.slice(0, 200),
      summary: { by_network: byNetwork, by_type: byType },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("sync-flowpay-plans error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
