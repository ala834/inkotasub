// Advisory lock utilities for serializing transactions per user
// Uses PostgreSQL advisory locks to prevent race conditions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Acquire a PostgreSQL advisory lock for a user's wallet operations.
 * Uses pg_try_advisory_xact_lock which is transaction-scoped and non-blocking.
 * We use a hash of the user_id as the lock key.
 */
export async function acquireUserLock(userId: string): Promise<boolean> {
  const adminSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Convert UUID to a numeric lock key using a simple hash
  const lockKey = hashUuidToInt(userId);

  const { data, error } = await adminSupabase.rpc("try_advisory_lock", {
    lock_key: lockKey,
  });

  if (error) {
    console.error("Advisory lock error:", error);
    return false;
  }

  return data === true;
}

/**
 * Simple hash of UUID string to a 32-bit integer for use as advisory lock key.
 */
function hashUuidToInt(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Returns a response for when a lock cannot be acquired (concurrent transaction).
 */
export function lockConflictResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "Another transaction is being processed. Please wait a moment and try again.",
      success: false,
    }),
    {
      status: 409,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
