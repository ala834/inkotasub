import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are INKOTA SUB's friendly AI support assistant. You help users with questions about the VTU (Virtual Top-Up) platform.

You can answer questions about:
- **Wallet & Payments**: How to fund wallet (via bank transfer to virtual account or Paystack), wallet balance, payment issues
- **Airtime & Data**: How to buy airtime/data, supported networks (MTN, Airtel, Glo, 9mobile), pricing
- **Cable TV**: DSTV, GOtv, StarTimes subscriptions
- **Electricity**: Prepaid/postpaid meter token purchases
- **Exam PINs**: WAEC, NECO, NABTEB scratch cards
- **Recharge Cards**: Bulk recharge card printing
- **Transactions**: Transaction history, failed transactions, refunds (auto-refunded within 24hrs)
- **Account**: Profile settings, KYC verification, referral program, transaction PIN
- **Security**: Device management, biometric login, PIN reset

Key facts:
- Failed transactions are automatically refunded to wallet within 24 hours
- Users must set a 4-digit transaction PIN before making purchases
- KYC verification has 3 levels with increasing transaction limits
- Referral program gives rewards when referred users make transactions
- Support hours: Mon-Fri 8AM-10PM, Sat 9AM-8PM, Sun 10AM-6PM

Rules:
1. Be concise, friendly, and helpful. Use short paragraphs.
2. If you can answer the question confidently, do so.
3. If the question is about a specific transaction issue, account problem, or something you cannot resolve, tell the user you'll connect them with a human agent.
4. End your response with exactly one of these tags (no other text after the tag):
   - [RESOLVED] if you answered the question fully
   - [ESCALATE] if the user needs human assistance
5. Never make up information. If unsure, escalate.
6. Keep responses under 150 words.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication to prevent unauthenticated abuse of the AI gateway.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service temporarily unavailable." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-support-chat error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
