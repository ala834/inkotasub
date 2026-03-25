// Simple in-memory rate limiter for edge functions
// Limits requests per user per function within a time window

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries periodically
let lastCleanup = 0;
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60000) return; // cleanup every 60s
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}

export interface RateLimitOptions {
  maxRequests: number;    // max requests per window
  windowMs: number;       // window in milliseconds
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  maxRequests: 5,
  windowMs: 60000, // 1 minute
};

export function checkRateLimit(
  userId: string,
  functionName: string,
  options: RateLimitOptions = DEFAULT_OPTIONS
): { allowed: boolean; retryAfterMs?: number } {
  cleanup();
  const key = `${functionName}:${userId}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true };
  }

  if (entry.count >= options.maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true };
}

export function rateLimitResponse(retryAfterMs: number, corsHeaders: Record<string, string>): Response {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({
      error: `Too many requests. Please wait ${retryAfterSec} seconds before trying again.`,
      success: false,
      retryAfter: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": retryAfterSec.toString(),
      },
    }
  );
}
