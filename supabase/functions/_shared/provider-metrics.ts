// Provider Metrics Tracking
// Records response time and success/failure for monitoring dashboard

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function recordProviderMetric(
  provider: string,
  serviceType: string,
  responseTimeMs: number,
  success: boolean,
  errorMessage?: string
): void {
  try {
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    adminSupabase.from("provider_metrics").insert({
      provider,
      service_type: serviceType,
      response_time_ms: responseTimeMs,
      success,
      error_message: errorMessage || null,
    }).then(({ error }) => {
      if (error) console.error("Metric recording failed:", error);
    });
  } catch (e) {
    console.error("Provider metric error:", e);
  }
}

// Wrap a provider call with metrics tracking
export async function withMetrics<T>(
  provider: string,
  serviceType: string,
  fn: () => Promise<T>,
  isSuccess: (result: T) => boolean,
  getError?: (result: T) => string | undefined
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    const success = isSuccess(result);
    recordProviderMetric(provider, serviceType, elapsed, success, getError?.(result));
    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    recordProviderMetric(provider, serviceType, elapsed, false, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}
