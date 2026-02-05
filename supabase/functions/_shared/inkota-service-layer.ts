 // INKOTA SUB - Unified Service Layer
 // Abstracts SUBPADI and SMEPlug providers from users
 // Handles provider routing and automatic failover
 
 export type ServiceType = 'airtime' | 'data' | 'electricity' | 'cable' | 'exam_pin' | 'transfer';
 export type Provider = 'subpadi' | 'smeplug';
 
 // Default provider routing configuration
 // Airtime & Transfer -> SUBPADI (primary)
 // Data & Exam Cards -> SMEPlug (primary)
 export const DEFAULT_PROVIDER_ROUTING: Record<ServiceType, { primary: Provider; fallback: Provider }> = {
   airtime: { primary: 'subpadi', fallback: 'smeplug' },
   transfer: { primary: 'subpadi', fallback: 'smeplug' },
   data: { primary: 'smeplug', fallback: 'subpadi' },
   exam_pin: { primary: 'smeplug', fallback: 'subpadi' },
   electricity: { primary: 'subpadi', fallback: 'smeplug' },
   cable: { primary: 'subpadi', fallback: 'smeplug' },
 };
 
 // Normalized transaction response - consistent format regardless of provider
 export interface NormalizedTransactionResponse {
   success: boolean;
   message: string;
   transactionId?: string;
   reference?: string;
   // Internal tracking only - never exposed to UI
   _internal: {
     providerUsed: Provider;
     fallbackAttempted: boolean;
     fallbackProvider?: Provider;
     primaryResponse?: unknown;
     fallbackResponse?: unknown;
     rawResponse: unknown;
   };
 }
 
 // Airtime purchase request
 export interface AirtimePurchaseRequest {
   network: string;
   phoneNumber: string;
   amount: number;
 }
 
 // Data purchase request
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
 
 // Get network ID for SMEPlug
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
   providerUsed: Provider,
   rawResponse: unknown,
   options?: {
     fallbackAttempted?: boolean;
     fallbackProvider?: Provider;
     primaryResponse?: unknown;
     fallbackResponse?: unknown;
     reference?: string;
   }
 ): NormalizedTransactionResponse {
   // User-friendly messages - never mention provider names
   const userMessage = success
     ? getSuccessMessage(message)
     : getErrorMessage(message);
 
   return {
     success,
     message: userMessage,
     reference: options?.reference,
     _internal: {
       providerUsed,
       fallbackAttempted: options?.fallbackAttempted || false,
       fallbackProvider: options?.fallbackProvider,
       primaryResponse: options?.primaryResponse,
       fallbackResponse: options?.fallbackResponse,
       rawResponse,
     },
   };
 }
 
 // Normalize success messages
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
 
 // Normalize error messages - remove provider references
 function getErrorMessage(rawMessage: string): string {
   const normalized = rawMessage.toLowerCase();
   
   // Remove provider name references
   let message = rawMessage
     .replace(/subpadi/gi, '')
     .replace(/smeplug/gi, '')
     .replace(/sme\s*plug/gi, '')
     .replace(/sub\s*padi/gi, '')
     .trim();
   
   // Map common errors to user-friendly messages
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
   if (normalized.includes('failed') && normalized.includes('all provider')) {
     return 'Service temporarily unavailable. Please try again later.';
   }
   if (normalized.includes('api error') || normalized.includes('server error')) {
     return 'Service temporarily unavailable. Please try again later.';
   }
   
   // Return cleaned message or generic error
   return message || 'Transaction failed. Please try again.';
 }
 
 // Log transaction for admin tracking (internal use only)
 export function logProviderTransaction(
   serviceType: ServiceType,
   response: NormalizedTransactionResponse,
   additionalData?: Record<string, unknown>
 ): void {
   console.log('=== INKOTA SUB Transaction Log ===');
   console.log('Service Type:', serviceType);
   console.log('Success:', response.success);
   console.log('Provider Used:', response._internal.providerUsed);
   console.log('Fallback Attempted:', response._internal.fallbackAttempted);
   if (response._internal.fallbackAttempted) {
     console.log('Fallback Provider:', response._internal.fallbackProvider);
   }
   if (additionalData) {
     console.log('Additional Data:', JSON.stringify(additionalData));
   }
   console.log('==================================');
 }
 
 // SUBPADI API call for airtime
 export async function subpadiAirtime(request: AirtimePurchaseRequest): Promise<NormalizedTransactionResponse> {
   const apiKey = Deno.env.get("SUBPADI_API_KEY");
   const apiToken = Deno.env.get("SUBPADI_API_TOKEN");
 
   if (!apiKey || !apiToken) {
     return normalizeResponse(false, "Service not configured", 'subpadi', null);
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
     
     return normalizeResponse(
       success,
       data?.message || (success ? "Airtime purchased successfully" : "Purchase failed"),
       'subpadi',
       data,
       { reference: data?.reference }
     );
   } catch (error) {
     console.error("SUBPADI Airtime Error:", error);
     return normalizeResponse(false, error instanceof Error ? error.message : "API error", 'subpadi', null);
   }
 }
 
 // SMEPlug API call for airtime
 export async function smeplugAirtime(request: AirtimePurchaseRequest): Promise<NormalizedTransactionResponse> {
   const apiKey = Deno.env.get("SMEPLUG_API_KEY");
 
   if (!apiKey) {
     return normalizeResponse(false, "Service not configured", 'smeplug', null);
   }
 
   const networkId = getSmeplugNetworkId(request.network);
   if (!networkId) {
     return normalizeResponse(false, "Invalid network", 'smeplug', null);
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
       'smeplug',
       data,
       { reference: data?.reference || data?.data?.reference }
     );
   } catch (error) {
     console.error("SMEPlug Airtime Error:", error);
     return normalizeResponse(false, error instanceof Error ? error.message : "API error", 'smeplug', null);
   }
 }
 
 // SUBPADI API call for data
 export async function subpadiData(request: DataPurchaseRequest): Promise<NormalizedTransactionResponse> {
   const apiKey = Deno.env.get("SUBPADI_API_KEY");
   const apiToken = Deno.env.get("SUBPADI_API_TOKEN");
 
   if (!apiKey || !apiToken) {
     return normalizeResponse(false, "Service not configured", 'subpadi', null);
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
     
     return normalizeResponse(
       success,
       data?.message || (success ? "Data purchased successfully" : "Purchase failed"),
       'subpadi',
       data,
       { reference: data?.reference }
     );
   } catch (error) {
     console.error("SUBPADI Data Error:", error);
     return normalizeResponse(false, error instanceof Error ? error.message : "API error", 'subpadi', null);
   }
 }
 
 // SMEPlug API call for data
 export async function smeplugData(request: DataPurchaseRequest): Promise<NormalizedTransactionResponse> {
   const apiKey = Deno.env.get("SMEPLUG_API_KEY");
 
   if (!apiKey) {
     return normalizeResponse(false, "Service not configured", 'smeplug', null);
   }
 
   const networkId = getSmeplugNetworkId(request.network);
   if (!networkId) {
     return normalizeResponse(false, "Invalid network", 'smeplug', null);
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
       'smeplug',
       data,
       { reference: data?.reference || data?.data?.reference }
     );
   } catch (error) {
     console.error("SMEPlug Data Error:", error);
     return normalizeResponse(false, error instanceof Error ? error.message : "API error", 'smeplug', null);
   }
 }
 
 // Unified airtime purchase with automatic failover
 export async function purchaseAirtime(
   request: AirtimePurchaseRequest,
   config?: { primary?: Provider; fallback?: Provider; fallbackEnabled?: boolean }
 ): Promise<NormalizedTransactionResponse> {
   const routing = config || DEFAULT_PROVIDER_ROUTING.airtime;
   const primary = config?.primary || routing.primary;
   const fallback = config?.fallback || routing.fallback;
   const fallbackEnabled = config?.fallbackEnabled ?? true;
 
   // Try primary provider
   let result = primary === 'subpadi'
     ? await subpadiAirtime(request)
     : await smeplugAirtime(request);
 
   // If primary fails and fallback is enabled, try fallback
   if (!result.success && fallbackEnabled) {
     console.log(`Primary provider (${primary}) failed, trying fallback (${fallback})...`);
     const primaryResponse = result._internal.rawResponse;
     
     result = fallback === 'subpadi'
       ? await subpadiAirtime(request)
       : await smeplugAirtime(request);
     
     // Update internal tracking
     result._internal.fallbackAttempted = true;
     result._internal.fallbackProvider = fallback;
     result._internal.primaryResponse = primaryResponse;
     result._internal.fallbackResponse = result._internal.rawResponse;
   }
 
   logProviderTransaction('airtime', result, { request });
   return result;
 }
 
 // Unified data purchase with automatic failover
 export async function purchaseData(
   request: DataPurchaseRequest,
   config?: { primary?: Provider; fallback?: Provider; fallbackEnabled?: boolean }
 ): Promise<NormalizedTransactionResponse> {
   const routing = config || DEFAULT_PROVIDER_ROUTING.data;
   const primary = config?.primary || routing.primary;
   const fallback = config?.fallback || routing.fallback;
   const fallbackEnabled = config?.fallbackEnabled ?? true;
 
   // Try primary provider
   let result = primary === 'subpadi'
     ? await subpadiData(request)
     : await smeplugData(request);
 
   // If primary fails and fallback is enabled, try fallback
   if (!result.success && fallbackEnabled) {
     console.log(`Primary provider (${primary}) failed, trying fallback (${fallback})...`);
     const primaryResponse = result._internal.rawResponse;
     
     result = fallback === 'subpadi'
       ? await subpadiData(request)
       : await smeplugData(request);
     
     // Update internal tracking
     result._internal.fallbackAttempted = true;
     result._internal.fallbackProvider = fallback;
     result._internal.primaryResponse = primaryResponse;
     result._internal.fallbackResponse = result._internal.rawResponse;
   }
 
   logProviderTransaction('data', result, { request });
   return result;
 }