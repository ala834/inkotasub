// Fraud Detection Layer
// Detects rapid repeated purchases, high volume, suspicious patterns

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface FraudCheckResult {
  allowed: boolean;
  reason?: string;
  severity?: 'warning' | 'block' | 'review';
}

// In-memory sliding window for rapid purchase detection
const purchaseWindows = new Map<string, number[]>();
const RAPID_PURCHASE_WINDOW_MS = 60_000; // 1 minute
const RAPID_PURCHASE_THRESHOLD = 5; // max 5 purchases per minute
const HIGH_VOLUME_WINDOW_MS = 3600_000; // 1 hour  
const HIGH_VOLUME_THRESHOLD = 30; // max 30 purchases per hour

function cleanupWindow(timestamps: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter(t => t > cutoff);
}

export async function checkFraud(
  userId: string,
  serviceType: string,
  amount: number,
  metadata?: { ip?: string; deviceId?: string }
): Promise<FraudCheckResult> {
  const key = `${userId}:${serviceType}`;
  const now = Date.now();

  // Check rapid purchase rate
  let timestamps = purchaseWindows.get(key) || [];
  timestamps = cleanupWindow(timestamps, HIGH_VOLUME_WINDOW_MS);
  
  const recentCount = timestamps.filter(t => t > now - RAPID_PURCHASE_WINDOW_MS).length;
  
  if (recentCount >= RAPID_PURCHASE_THRESHOLD) {
    // Log fraud flag asynchronously
    logFraudFlag(userId, 'rapid_purchase', 'block', {
      service_type: serviceType,
      purchases_per_minute: recentCount,
      amount,
      ...metadata,
    });
    return {
      allowed: false,
      reason: 'Too many rapid purchases detected. Please slow down.',
      severity: 'block',
    };
  }

  // Check hourly volume
  if (timestamps.length >= HIGH_VOLUME_THRESHOLD) {
    logFraudFlag(userId, 'high_volume', 'warning', {
      service_type: serviceType,
      purchases_per_hour: timestamps.length,
      amount,
      ...metadata,
    });
    return {
      allowed: false,
      reason: 'Purchase limit reached. Please try again later.',
      severity: 'block',
    };
  }

  // Record this purchase timestamp
  timestamps.push(now);
  purchaseWindows.set(key, timestamps);

  // Cleanup stale keys periodically
  if (purchaseWindows.size > 10000) {
    for (const [k, v] of purchaseWindows) {
      const cleaned = cleanupWindow(v, HIGH_VOLUME_WINDOW_MS);
      if (cleaned.length === 0) purchaseWindows.delete(k);
      else purchaseWindows.set(k, cleaned);
    }
  }

  return { allowed: true };
}

function logFraudFlag(
  userId: string,
  flagType: string,
  severity: string,
  details: Record<string, unknown>
): void {
  // Fire and forget - don't block the transaction flow
  try {
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    adminSupabase.from("fraud_flags").insert({
      user_id: userId,
      flag_type: flagType,
      severity,
      details,
    }).then(() => {});
  } catch (e) {
    console.error("Failed to log fraud flag:", e);
  }
}

export function fraudBlockResponse(
  reason: string,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ error: reason, success: false }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
