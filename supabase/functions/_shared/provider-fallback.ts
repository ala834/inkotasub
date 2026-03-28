// Single-provider execution with metrics tracking
// Provider: Subpadi only

import { isSubpadiConfigured, type SubpadiResponse } from "./subpadi-provider.ts";
import { withMetrics } from "./provider-metrics.ts";

export interface FallbackResult {
  success: boolean;
  message: string;
  providerUsed: 'subpadi';
  fallbackAttempted: false;
  rawResponse: unknown;
  fallbackResponse?: unknown;
  reference?: string;
  token?: string;
}

// Execute provider call with metrics (Subpadi only)
export async function executeWithFallback(
  subpadiFn: () => Promise<SubpadiResponse>,
  _legacyFn?: unknown, // kept for call-site compat, unused
  serviceType: string = 'unknown',
): Promise<FallbackResult> {
  if (!isSubpadiConfigured()) {
    return {
      success: false,
      message: "Service provider not configured. Please contact support.",
      providerUsed: 'subpadi',
      fallbackAttempted: false,
      rawResponse: null,
    };
  }

  const subpadiResult = await withMetrics(
    'subpadi', serviceType, subpadiFn,
    (r) => r.success,
    (r) => r.success ? undefined : r.message
  );

  return {
    success: subpadiResult.success,
    message: subpadiResult.message,
    providerUsed: 'subpadi',
    fallbackAttempted: false,
    rawResponse: subpadiResult.rawResponse,
    reference: subpadiResult.reference,
    token: subpadiResult.token,
  };
}
