// VTU Provider Abstraction Layer
// Supports SUBPADI (primary) and SMEPlug (fallback)

export interface VTUProviderResponse {
  success: boolean;
  message: string;
  data?: unknown;
  provider: 'subpadi' | 'smeplug';
  reference?: string;
}

export interface AirtimeRequest {
  network: string;
  phoneNumber: string;
  amount: number;
}

export interface DataRequest {
  network: string;
  phoneNumber: string;
  planId: string;
  amount: number;
}

export interface ProviderConfig {
  primary: 'subpadi' | 'smeplug';
  fallback: 'subpadi' | 'smeplug' | null;
  fallbackEnabled: boolean;
}

// Generate unique transaction reference
export function generateReference(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `${prefix}_${timestamp}_${random}`.toUpperCase();
}

// SUBPADI API calls
export async function subpadiPurchaseAirtime(request: AirtimeRequest): Promise<VTUProviderResponse> {
  const apiKey = Deno.env.get("SUBPADI_API_KEY");
  const apiToken = Deno.env.get("SUBPADI_API_TOKEN");

  if (!apiKey || !apiToken) {
    return { success: false, message: "SUBPADI credentials not configured", provider: 'subpadi' };
  }

  try {
    const response = await fetch("https://subpadi.com/api/airtime", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        network: request.network.toUpperCase(),
        phone: request.phoneNumber,
        amount: request.amount,
      }),
    });

    const data = await response.json();
    const success = data?.status === "success" || data?.code === "000";
    
    console.log("SUBPADI Airtime Response:", data);
    
    return {
      success,
      message: data?.message || (success ? "Airtime purchased successfully" : "Purchase failed"),
      data,
      provider: 'subpadi',
      reference: data?.reference,
    };
  } catch (error) {
    console.error("SUBPADI Airtime Error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "SUBPADI API error",
      provider: 'subpadi',
    };
  }
}

export async function subpadiPurchaseData(request: DataRequest): Promise<VTUProviderResponse> {
  const apiKey = Deno.env.get("SUBPADI_API_KEY");
  const apiToken = Deno.env.get("SUBPADI_API_TOKEN");

  if (!apiKey || !apiToken) {
    return { success: false, message: "SUBPADI credentials not configured", provider: 'subpadi' };
  }

  try {
    const response = await fetch("https://subpadi.com/api/data", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        network: request.network.toUpperCase(),
        phone: request.phoneNumber,
        plan_id: request.planId,
      }),
    });

    const data = await response.json();
    const success = data?.status === "success" || data?.code === "000";
    
    console.log("SUBPADI Data Response:", data);
    
    return {
      success,
      message: data?.message || (success ? "Data purchased successfully" : "Purchase failed"),
      data,
      provider: 'subpadi',
      reference: data?.reference,
    };
  } catch (error) {
    console.error("SUBPADI Data Error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "SUBPADI API error",
      provider: 'subpadi',
    };
  }
}

// SMEPlug API calls
export async function smeplugPurchaseAirtime(request: AirtimeRequest): Promise<VTUProviderResponse> {
  const apiKey = Deno.env.get("SMEPLUG_API_KEY");

  if (!apiKey) {
    return { success: false, message: "SMEPlug credentials not configured", provider: 'smeplug' };
  }

  // Map network codes to SMEPlug format
  const networkMap: Record<string, number> = {
    'MTN': 1,
    'GLO': 2,
    'AIRTEL': 3,
    '9MOBILE': 4,
    'ETISALAT': 4,
  };

  const networkId = networkMap[request.network.toUpperCase()];
  if (!networkId) {
    return { success: false, message: "Invalid network", provider: 'smeplug' };
  }

  try {
    const response = await fetch("https://smeplug.ng/api/v1/airtime/purchase", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        network_id: networkId,
        phone: request.phoneNumber,
        amount: request.amount,
      }),
    });

    const data = await response.json();
    const success = data?.status === "success" || data?.success === true;
    
    console.log("SMEPlug Airtime Response:", data);
    
    return {
      success,
      message: data?.message || (success ? "Airtime purchased successfully" : "Purchase failed"),
      data,
      provider: 'smeplug',
      reference: data?.reference || data?.data?.reference,
    };
  } catch (error) {
    console.error("SMEPlug Airtime Error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "SMEPlug API error",
      provider: 'smeplug',
    };
  }
}

export async function smeplugPurchaseData(request: DataRequest): Promise<VTUProviderResponse> {
  const apiKey = Deno.env.get("SMEPLUG_API_KEY");

  if (!apiKey) {
    return { success: false, message: "SMEPlug credentials not configured", provider: 'smeplug' };
  }

  // Map network codes to SMEPlug format
  const networkMap: Record<string, number> = {
    'MTN': 1,
    'GLO': 2,
    'AIRTEL': 3,
    '9MOBILE': 4,
    'ETISALAT': 4,
  };

  const networkId = networkMap[request.network.toUpperCase()];
  if (!networkId) {
    return { success: false, message: "Invalid network", provider: 'smeplug' };
  }

  try {
    const response = await fetch("https://smeplug.ng/api/v1/data/purchase", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        network_id: networkId,
        phone: request.phoneNumber,
        plan_id: request.planId,
        amount: request.amount,
      }),
    });

    const data = await response.json();
    const success = data?.status === "success" || data?.success === true;
    
    console.log("SMEPlug Data Response:", data);
    
    return {
      success,
      message: data?.message || (success ? "Data purchased successfully" : "Purchase failed"),
      data,
      provider: 'smeplug',
      reference: data?.reference || data?.data?.reference,
    };
  } catch (error) {
    console.error("SMEPlug Data Error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "SMEPlug API error",
      provider: 'smeplug',
    };
  }
}

// Unified purchase functions with fallback
export async function purchaseAirtimeWithFallback(
  request: AirtimeRequest,
  config: ProviderConfig
): Promise<{ primary: VTUProviderResponse; fallback?: VTUProviderResponse }> {
  // Try primary provider
  let primaryResult: VTUProviderResponse;
  
  if (config.primary === 'subpadi') {
    primaryResult = await subpadiPurchaseAirtime(request);
  } else {
    primaryResult = await smeplugPurchaseAirtime(request);
  }

  // If primary succeeds or fallback is disabled, return
  if (primaryResult.success || !config.fallbackEnabled || !config.fallback) {
    return { primary: primaryResult };
  }

  console.log(`Primary provider (${config.primary}) failed, trying fallback (${config.fallback})...`);

  // Try fallback provider
  let fallbackResult: VTUProviderResponse;
  
  if (config.fallback === 'subpadi') {
    fallbackResult = await subpadiPurchaseAirtime(request);
  } else {
    fallbackResult = await smeplugPurchaseAirtime(request);
  }

  return { primary: primaryResult, fallback: fallbackResult };
}

export async function purchaseDataWithFallback(
  request: DataRequest,
  config: ProviderConfig
): Promise<{ primary: VTUProviderResponse; fallback?: VTUProviderResponse }> {
  // Try primary provider
  let primaryResult: VTUProviderResponse;
  
  if (config.primary === 'subpadi') {
    primaryResult = await subpadiPurchaseData(request);
  } else {
    primaryResult = await smeplugPurchaseData(request);
  }

  // If primary succeeds or fallback is disabled, return
  if (primaryResult.success || !config.fallbackEnabled || !config.fallback) {
    return { primary: primaryResult };
  }

  console.log(`Primary provider (${config.primary}) failed, trying fallback (${config.fallback})...`);

  // Try fallback provider
  let fallbackResult: VTUProviderResponse;
  
  if (config.fallback === 'subpadi') {
    fallbackResult = await subpadiPurchaseData(request);
  } else {
    fallbackResult = await smeplugPurchaseData(request);
  }

  return { primary: primaryResult, fallback: fallbackResult };
}
