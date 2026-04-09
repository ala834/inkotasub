// Multi-provider execution with fallback support
// Providers: Subpadi (primary), SMEPlug (fallback)

import { isSubpadiConfigured, type SubpadiResponse } from "./subpadi-provider.ts";
import { isSmeplugConfigured, type SmeplugResponse } from "./smeplug-provider.ts";
import { withMetrics } from "./provider-metrics.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface FallbackResult {
  success: boolean;
  message: string;
  providerUsed: string;
  fallbackAttempted: boolean;
  rawResponse: unknown;
  fallbackResponse?: unknown;
  reference?: string;
  token?: string;
}

type ProviderResponse = SubpadiResponse | SmeplugResponse;

interface ProviderConfig {
  primaryProvider: string;
  fallbackProvider: string | null;
  fallbackEnabled: boolean;
}

interface ExecuteWithFallbackOptions {
  preferredProvider?: string | null;
  disableFallback?: boolean;
}

// Get provider config from database
async function getProviderConfig(serviceType: string, network?: string): Promise<ProviderConfig> {
  const defaults: ProviderConfig = {
    primaryProvider: 'subpadi',
    fallbackProvider: 'smeplug',
    fallbackEnabled: true,
  };

  try {
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Try network-specific config first, then service-level
    let query = adminSupabase
      .from("provider_config")
      .select("*")
      .eq("service_type", serviceType)
      .eq("is_active", true);

    const { data: configs } = await query;

    if (configs && configs.length > 0) {
      // Prefer network-specific config
      const networkConfig = network
        ? configs.find(c => c.network?.toUpperCase() === network.toUpperCase())
        : null;
      const generalConfig = configs.find(c => !c.network);
      const config = networkConfig || generalConfig;

      if (config) {
        return {
          primaryProvider: config.primary_provider || 'subpadi',
          fallbackProvider: config.fallback_provider || null,
          fallbackEnabled: config.fallback_enabled ?? true,
        };
      }
    }
  } catch (e) {
    console.error("Failed to fetch provider config, using defaults:", e);
  }

  return defaults;
}

function isProviderConfigured(provider: string): boolean {
  switch (provider) {
    case 'subpadi': return isSubpadiConfigured();
    case 'smeplug': return isSmeplugConfigured();
    default: return false;
  }
}

// Execute provider call with optional fallback
export async function executeWithFallback(
  subpadiFn: () => Promise<ProviderResponse>,
  smeplugFn?: () => Promise<ProviderResponse>,
  serviceType: string = 'unknown',
  network?: string,
  options: ExecuteWithFallbackOptions = {},
): Promise<FallbackResult> {
  let config = await getProviderConfig(serviceType, network);

  const providerFns: Record<string, (() => Promise<ProviderResponse>) | undefined> = {
    subpadi: subpadiFn,
    smeplug: smeplugFn,
  };

  const preferredProvider = options.preferredProvider?.toLowerCase();
  if (preferredProvider && providerFns[preferredProvider]) {
    const fallbackProvider = options.disableFallback
      ? null
      : [config.primaryProvider, config.fallbackProvider].find(
          (candidate): candidate is string =>
            Boolean(candidate) &&
            candidate !== preferredProvider &&
            Boolean(providerFns[candidate]),
        ) ?? null;

    config = {
      primaryProvider: preferredProvider,
      fallbackProvider,
      fallbackEnabled: !options.disableFallback && Boolean(fallbackProvider),
    };
  }

  const primaryFn = providerFns[config.primaryProvider];
  const fallbackFn = config.fallbackProvider ? providerFns[config.fallbackProvider] : undefined;

  // Check primary provider
  if (!primaryFn || !isProviderConfigured(config.primaryProvider)) {
    // Try fallback as primary
    if (fallbackFn && isProviderConfigured(config.fallbackProvider!)) {
      console.log(`Primary provider ${config.primaryProvider} not configured, using ${config.fallbackProvider}`);
      const result = await withMetrics(
        config.fallbackProvider!, serviceType, fallbackFn,
        (r) => r.success, (r) => r.success ? undefined : r.message
      );
      return {
        success: result.success, message: result.message,
        providerUsed: config.fallbackProvider!, fallbackAttempted: false,
        rawResponse: result.rawResponse, reference: result.reference, token: result.token,
      };
    }
    return {
      success: false, message: "No service provider configured. Please contact support.",
      providerUsed: config.primaryProvider, fallbackAttempted: false, rawResponse: null,
    };
  }

  // Execute primary
  const primaryResult = await withMetrics(
    config.primaryProvider, serviceType, primaryFn,
    (r) => r.success, (r) => r.success ? undefined : r.message
  );

  if (primaryResult.success) {
    return {
      success: true, message: primaryResult.message,
      providerUsed: config.primaryProvider, fallbackAttempted: false,
      rawResponse: primaryResult.rawResponse, reference: primaryResult.reference, token: primaryResult.token,
    };
  }

  // Primary failed — try fallback
  if (config.fallbackEnabled && fallbackFn && isProviderConfigured(config.fallbackProvider!)) {
    console.log(`Primary provider ${config.primaryProvider} failed: ${primaryResult.message}. Trying fallback ${config.fallbackProvider}`);
    try {
      const fallbackResult = await withMetrics(
        config.fallbackProvider!, serviceType, fallbackFn,
        (r) => r.success, (r) => r.success ? undefined : r.message
      );

      return {
        success: fallbackResult.success,
        message: fallbackResult.success ? fallbackResult.message : primaryResult.message,
        providerUsed: fallbackResult.success ? config.fallbackProvider! : config.primaryProvider,
        fallbackAttempted: true,
        rawResponse: fallbackResult.success ? fallbackResult.rawResponse : primaryResult.rawResponse,
        fallbackResponse: fallbackResult.rawResponse,
        reference: fallbackResult.success ? fallbackResult.reference : primaryResult.reference,
        token: fallbackResult.success ? fallbackResult.token : primaryResult.token,
      };
    } catch (fbErr) {
      console.error(`Fallback provider ${config.fallbackProvider} threw:`, fbErr);
    }
  }

  // No fallback or fallback also failed
  return {
    success: false, message: primaryResult.message,
    providerUsed: config.primaryProvider, fallbackAttempted: config.fallbackEnabled && !!fallbackFn,
    rawResponse: primaryResult.rawResponse, reference: primaryResult.reference,
  };
}
