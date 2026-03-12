// Dual-provider fallback logic
// Primary: Subpadi, Fallback: SMEPlug

import { isSubpadiConfigured, type SubpadiResponse } from "./subpadi-provider.ts";
import { normalizeResponse, type NormalizedTransactionResponse } from "./inkota-service-layer.ts";

export interface FallbackResult {
  success: boolean;
  message: string;
  providerUsed: 'subpadi' | 'smeplug';
  fallbackAttempted: boolean;
  rawResponse: unknown;
  fallbackResponse?: unknown;
  reference?: string;
  token?: string;
}

// Execute with Subpadi-first, SMEPlug-fallback strategy
export async function executeWithFallback(
  subpadiFn: () => Promise<SubpadiResponse>,
  smeplugFn: () => Promise<NormalizedTransactionResponse>,
): Promise<FallbackResult> {
  // Try Subpadi first if configured
  if (isSubpadiConfigured()) {
    const subpadiResult = await subpadiFn();
    if (subpadiResult.success) {
      return {
        success: true,
        message: subpadiResult.message,
        providerUsed: 'subpadi',
        fallbackAttempted: false,
        rawResponse: subpadiResult.rawResponse,
        reference: subpadiResult.reference,
        token: subpadiResult.token,
      };
    }

    console.log("Subpadi failed, attempting SMEPlug fallback:", subpadiResult.message);

    // Fallback to SMEPlug
    const smeplugResult = await smeplugFn();
    return {
      success: smeplugResult.success,
      message: smeplugResult.message,
      providerUsed: smeplugResult.success ? 'smeplug' : 'subpadi',
      fallbackAttempted: true,
      rawResponse: subpadiResult.rawResponse,
      fallbackResponse: smeplugResult._internal.rawResponse,
      reference: smeplugResult.reference,
    };
  }

  // Subpadi not configured, use SMEPlug directly
  const smeplugResult = await smeplugFn();
  return {
    success: smeplugResult.success,
    message: smeplugResult.message,
    providerUsed: 'smeplug',
    fallbackAttempted: false,
    rawResponse: smeplugResult._internal.rawResponse,
    reference: smeplugResult.reference,
  };
}
