// INKOTA SUB - Unified Service Layer
// All services route through Subpadi as the sole provider

export type ServiceType = 'airtime' | 'data' | 'electricity' | 'cable' | 'exam_pin' | 'transfer' | 'recharge_card';

// Normalized transaction response
export interface NormalizedTransactionResponse {
  success: boolean;
  message: string;
  transactionId?: string;
  reference?: string;
  _internal: {
    providerUsed: 'subpadi';
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

// Generate unique transaction reference
export function generateReference(serviceType: ServiceType | string): string {
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
      providerUsed: 'subpadi',
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

  return rawMessage || 'Transaction failed. Please try again.';
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
