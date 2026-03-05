// INKOTA SUB - Unified Service Layer
// All services route through SMEPlug as the sole provider

export type ServiceType = 'airtime' | 'data' | 'electricity' | 'cable' | 'exam_pin' | 'transfer';

// Normalized transaction response
export interface NormalizedTransactionResponse {
  success: boolean;
  message: string;
  transactionId?: string;
  reference?: string;
  _internal: {
    providerUsed: 'smeplug';
    rawResponse: unknown;
  };
}

export interface AirtimePurchaseRequest {
  network: string;
  phoneNumber: string;
  amount: number;
}

export interface DataPurchaseRequest {
  network: string;
  phoneNumber: string;
  planId: string;
  amount: number;
}

// Network ID mapping for SMEPlug
export const SMEPLUG_NETWORK_MAP: Record<string, number> = {
  'MTN': 1,
  'GLO': 2,
  'AIRTEL': 3,
  '9MOBILE': 4,
  'ETISALAT': 4,
};

export function getSmeplugNetworkId(network: string): number | null {
  return SMEPLUG_NETWORK_MAP[network.toUpperCase()] || null;
}

// Generate unique transaction reference
export function generateReference(serviceType: ServiceType): string {
  const prefix = serviceType.toUpperCase().replace('_', '');
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `${prefix}_${timestamp}_${random}`.toUpperCase();
}

// Normalize provider responses to consistent format
export function normalizeResponse(
  success: boolean,
  message: string,
  rawResponse: unknown,
  options?: { reference?: string }
): NormalizedTransactionResponse {
  const userMessage = success ? getSuccessMessage(message) : getErrorMessage(message);

  return {
    success,
    message: userMessage,
    reference: options?.reference,
    _internal: {
      providerUsed: 'smeplug',
      rawResponse,
    },
  };
}

function getSuccessMessage(rawMessage: string): string {
  const normalized = rawMessage.toLowerCase();
  if (normalized.includes('airtime')) return 'Airtime purchased successfully';
  if (normalized.includes('data')) return 'Data bundle purchased successfully';
  if (normalized.includes('electricity') || normalized.includes('electric')) return 'Electricity token purchased successfully';
  if (normalized.includes('cable') || normalized.includes('tv')) return 'Cable TV subscription successful';
  if (normalized.includes('exam') || normalized.includes('pin')) return 'Exam card purchased successfully';
  if (normalized.includes('transfer')) return 'Transfer completed successfully';
  return 'Transaction completed successfully';
}

function getErrorMessage(rawMessage: string): string {
  const normalized = rawMessage.toLowerCase();
  let message = rawMessage.replace(/smeplug/gi, '').replace(/sme\s*plug/gi, '').trim();

  if (normalized.includes('insufficient') && normalized.includes('balance')) {
    return 'Insufficient balance. Please fund your wallet.';
  }
  if (normalized.includes('invalid') && (normalized.includes('phone') || normalized.includes('number'))) {
    return 'Invalid phone number. Please check and try again.';
  }
  if (normalized.includes('invalid') && normalized.includes('network')) {
    return 'Invalid network selected. Please try again.';
  }
  if (normalized.includes('not configured') || normalized.includes('credentials')) {
    return 'Service temporarily unavailable. Please try again later.';
  }
  if (normalized.includes('api error') || normalized.includes('server error')) {
    return 'Service temporarily unavailable. Please try again later.';
  }

  return message || 'Transaction failed. Please try again.';
}

// Log transaction for admin tracking
export function logProviderTransaction(
  serviceType: ServiceType,
  response: NormalizedTransactionResponse,
  additionalData?: Record<string, unknown>
): void {
  console.log('=== INKOTA SUB Transaction Log ===');
  console.log('Service Type:', serviceType);
  console.log('Success:', response.success);
  console.log('Provider Used:', response._internal.providerUsed);
  if (additionalData) {
    console.log('Additional Data:', JSON.stringify(additionalData));
  }
  console.log('==================================');
}

// SMEPlug airtime purchase
export async function purchaseAirtime(request: AirtimePurchaseRequest): Promise<NormalizedTransactionResponse> {
  const apiKey = Deno.env.get("SMEPLUG_API_KEY");
  if (!apiKey) {
    return normalizeResponse(false, "Service not configured", null);
  }

  const networkId = getSmeplugNetworkId(request.network);
  if (!networkId) {
    return normalizeResponse(false, "Invalid network", null);
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

    return normalizeResponse(
      success,
      data?.message || (success ? "Airtime purchased successfully" : "Purchase failed"),
      data,
      { reference: data?.reference || data?.data?.reference }
    );
  } catch (error) {
    console.error("SMEPlug Airtime Error:", error);
    return normalizeResponse(false, error instanceof Error ? error.message : "API error", null);
  }
}

// SMEPlug data purchase
export async function purchaseData(request: DataPurchaseRequest): Promise<NormalizedTransactionResponse> {
  const apiKey = Deno.env.get("SMEPLUG_API_KEY");
  if (!apiKey) {
    return normalizeResponse(false, "Service not configured", null);
  }

  const networkId = getSmeplugNetworkId(request.network);
  if (!networkId) {
    return normalizeResponse(false, "Invalid network", null);
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

    return normalizeResponse(
      success,
      data?.message || (success ? "Data purchased successfully" : "Purchase failed"),
      data,
      { reference: data?.reference || data?.data?.reference }
    );
  } catch (error) {
    console.error("SMEPlug Data Error:", error);
    return normalizeResponse(false, error instanceof Error ? error.message : "API error", null);
  }
}
