// VTU Provider Layer - SMEPlug Only
// All services route through SMEPlug as the sole VTU provider

export interface VTUProviderResponse {
  success: boolean;
  message: string;
  data?: unknown;
  provider: 'smeplug';
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

// Generate unique transaction reference
export function generateReference(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `${prefix}_${timestamp}_${random}`.toUpperCase();
}

// Network ID mapping for SMEPlug
const NETWORK_MAP: Record<string, number> = {
  'MTN': 1,
  'GLO': 2,
  'AIRTEL': 3,
  '9MOBILE': 4,
  'ETISALAT': 4,
};

function getNetworkId(network: string): number | null {
  return NETWORK_MAP[network.toUpperCase()] || null;
}

// SMEPlug API - Purchase Airtime
export async function purchaseAirtime(request: AirtimeRequest): Promise<VTUProviderResponse> {
  const apiKey = Deno.env.get("SMEPLUG_API_KEY");
  if (!apiKey) {
    return { success: false, message: "Service not configured", provider: 'smeplug' };
  }

  const networkId = getNetworkId(request.network);
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
      message: error instanceof Error ? error.message : "API error",
      provider: 'smeplug',
    };
  }
}

// SMEPlug API - Purchase Data
export async function purchaseData(request: DataRequest): Promise<VTUProviderResponse> {
  const apiKey = Deno.env.get("SMEPLUG_API_KEY");
  if (!apiKey) {
    return { success: false, message: "Service not configured", provider: 'smeplug' };
  }

  const networkId = getNetworkId(request.network);
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
      message: error instanceof Error ? error.message : "API error",
      provider: 'smeplug',
    };
  }
}
