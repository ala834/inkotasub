// Subpadi API Provider
// Base URL: https://subpadi.com/api/
// Auth: Authorization: Token {SUBPADI_API_TOKEN}

const SUBPADI_BASE_URL = "https://subpadi.com/api";
const SUBPADI_TIMEOUT_MS = 10000; // 10 seconds
const SUBPADI_MAX_RETRIES = 2;

function parseSubpadiJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function normalizePurchaseResult(
  data: any,
  successMessage: string,
  fallbackFailureMessage: string,
): Pick<SubpadiResponse, "success" | "message"> {
  const status = String(data?.status ?? data?.Status ?? "").toLowerCase();
  const hasError = Boolean(data?.error) || data?.success === false || status === "failed";

  // Detect field-level validation errors like {"plan": ["Invalid pk ..."], "network": ["..."]}
  const fieldErrors = extractFieldErrors(data);

  const success = !hasError && !fieldErrors && (
    data?.success === true ||
    status === "success" ||
    status === "successful"
  );

  let message: string;
  if (fieldErrors) {
    message = fieldErrors;
  } else if (Array.isArray(data?.error)) {
    message = data.error.join("; ");
  } else {
    message = data?.error || data?.message || data?.msg || data?.detail || fallbackFailureMessage;
  }

  return {
    success,
    message: success ? successMessage : message,
  };
}

// Extract field-level validation errors from Subpadi responses like {"plan": ["Invalid pk..."]}
function extractFieldErrors(data: any): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const knownNonErrorKeys = new Set(["success", "status", "Status", "message", "msg", "detail", "error", "reference", "data", "id", "raw"]);
  const errors: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (knownNonErrorKeys.has(key)) continue;
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
      errors.push(`${key}: ${value.join("; ")}`);
    }
  }
  return errors.length > 0 ? errors.join(". ") : null;
}

function getHeaders(): Record<string, string> {
  const token = Deno.env.get("SUBPADI_API_TOKEN");
  return {
    "Authorization": `Token ${token}`,
    "Content-Type": "application/json",
  };
}

export function isSubpadiConfigured(): boolean {
  return !!Deno.env.get("SUBPADI_API_TOKEN");
}

// Network ID mapping for Subpadi
const SUBPADI_NETWORK_MAP: Record<string, number> = {
  'MTN': 1,
  'GLO': 2,
  'AIRTEL': 3,
  '9MOBILE': 4,
  'ETISALAT': 4,
};

export function getSubpadiNetworkId(network: string): number | null {
  return SUBPADI_NETWORK_MAP[network.toUpperCase()] || null;
}

export interface SubpadiResponse {
  success: boolean;
  message: string;
  rawResponse: unknown;
  reference?: string;
  token?: string; // for electricity
}

// Fetch with timeout and retry logic
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = SUBPADI_MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SUBPADI_TIMEOUT_MS);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Subpadi request attempt ${attempt + 1}/${retries + 1} failed:`, lastError.message);

      if (attempt < retries) {
        // Wait before retrying (exponential backoff: 1s, 2s)
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
      }
    }
  }

  throw lastError || new Error("Subpadi API request failed after retries");
}

// GET /api/user/ - Check user details and balance
export async function subpadiGetUserBalance(): Promise<SubpadiResponse> {
  try {
    const response = await fetchWithRetry(`${SUBPADI_BASE_URL}/user/`, {
      method: "GET",
      headers: getHeaders(),
    });
    const data = await response.json();
    console.log("Subpadi User/Balance Response:", JSON.stringify(data));
    return {
      success: response.ok,
      message: response.ok ? "Balance retrieved" : data?.message || "Failed to get balance",
      rawResponse: data,
    };
  } catch (error) {
    console.error("Subpadi User/Balance Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// POST /api/topup/ - Buy Airtime
export async function subpadiPurchaseAirtime(
  network: string, phoneNumber: string, amount: number
): Promise<SubpadiResponse> {
  const networkId = getSubpadiNetworkId(network);
  if (!networkId) return { success: false, message: "Invalid network", rawResponse: null };

  try {
    const response = await fetchWithRetry(`${SUBPADI_BASE_URL}/topup/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        network: networkId,
        amount: String(amount),
        mobile_number: phoneNumber,
        Ported_number: true,
        airtime_type: "VTU",
      }),
    });
    const text = await response.text();
    const data = parseSubpadiJson(text);
    console.log("Subpadi Airtime Response:", JSON.stringify(data));
    const result = normalizePurchaseResult(data, "Airtime purchased", "Purchase failed");

    return {
      success: result.success,
      message: result.message,
      rawResponse: data,
      reference: data?.reference || data?.data?.reference || data?.id?.toString(),
    };
  } catch (error) {
    console.error("Subpadi Airtime Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// POST /api/data/ - Buy Data
export async function subpadiPurchaseData(
  network: string, phoneNumber: string, planId: string, _amount: number
): Promise<SubpadiResponse> {
  const networkId = getSubpadiNetworkId(network);
  if (!networkId) return { success: false, message: "Invalid network", rawResponse: null };

  try {
    const response = await fetchWithRetry(`${SUBPADI_BASE_URL}/data/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        network: networkId,
        mobile_number: phoneNumber,
        plan: parseInt(planId, 10),
        Ported_number: true,
      }),
    });
    const text = await response.text();
    const data = parseSubpadiJson(text);
    console.log("Subpadi Data Response:", JSON.stringify(data));
    const result = normalizePurchaseResult(data, "Data purchased", "Purchase failed");
    return {
      success: result.success,
      message: result.message,
      rawResponse: data,
      reference: data?.reference || data?.data?.reference || data?.id?.toString(),
    };
  } catch (error) {
    console.error("Subpadi Data Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// POST /api/cablesub - Buy Cable Subscription
export async function subpadiPurchaseCable(
  serviceId: string, smartcardNumber: string, planId: string, _amount: number
): Promise<SubpadiResponse> {
  try {
    const response = await fetchWithRetry(`${SUBPADI_BASE_URL}/cablesub`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        cablename: parseInt(serviceId, 10),
        cableplan: parseInt(planId, 10),
        smart_card_number: smartcardNumber,
      }),
    });
    const text = await response.text();
    const data = parseSubpadiJson(text);
    console.log("Subpadi Cable Response:", JSON.stringify(data));
    const result = normalizePurchaseResult(data, "Cable subscription successful", "Subscription failed");
    return {
      success: result.success,
      message: result.message,
      rawResponse: data,
      reference: data?.reference || data?.data?.reference || data?.id?.toString(),
    };
  } catch (error) {
    console.error("Subpadi Cable Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// POST /api/billpayment/ - Electricity Bill Payment
export async function subpadiPurchaseElectricity(
  discoId: string, meterNumber: string, amount: number, meterType: string
): Promise<SubpadiResponse> {
  // meterType: "prepaid" -> 1, "postpaid" -> 2
  const mType = meterType.toLowerCase() === "prepaid" ? 1 : 2;

  try {
    const response = await fetchWithRetry(`${SUBPADI_BASE_URL}/billpayment/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        disco_name: parseInt(discoId, 10),
        amount,
        meter_number: meterNumber,
        MeterType: mType,
      }),
    });
    const text = await response.text();
    const data = parseSubpadiJson(text);
    console.log("Subpadi Electricity Response:", JSON.stringify(data));
    const result = normalizePurchaseResult(data, "Electricity purchased", "Purchase failed");
    const token = data?.data?.token || data?.token || data?.purchased_token;
    return {
      success: result.success,
      message: result.message,
      rawResponse: data,
      reference: data?.reference || data?.data?.reference || data?.id?.toString(),
      token,
    };
  } catch (error) {
    console.error("Subpadi Electricity Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// POST /api/exam/ - Buy Exam Pin (kept as /api/ since no v1 docs found, may need adjustment)
export async function subpadiPurchaseExamPin(
  examType: string, quantity: number
): Promise<SubpadiResponse> {
  try {
    const response = await fetchWithRetry(`${SUBPADI_BASE_URL}/exam/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ exam_type: examType, quantity }),
    });
    const text = await response.text();
    const data = parseSubpadiJson(text);
    console.log("Subpadi Exam Response:", JSON.stringify(data));
    const result = normalizePurchaseResult(data, "Exam card purchased", "Purchase failed");
    return {
      success: result.success,
      message: result.message,
      rawResponse: data,
      reference: data?.reference || data?.data?.reference || data?.id?.toString(),
    };
  } catch (error) {
    console.error("Subpadi Exam Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// GET /api/validateiuc - Validate IUC/Smartcard
export async function subpadiValidateSmartcard(
  smartcardNumber: string, cableName: number
): Promise<SubpadiResponse> {
  try {
    const url = `${SUBPADI_BASE_URL}/validateiuc?smart_card_number=${smartcardNumber}&cablename=${cableName}`;
    const response = await fetchWithRetry(url, {
      method: "GET",
      headers: getHeaders(),
    });
    const data = await response.json();
    console.log("Subpadi Validate IUC Response:", JSON.stringify(data));
    return {
      success: response.ok,
      message: data?.message || (response.ok ? "Validation successful" : "Validation failed"),
      rawResponse: data,
    };
  } catch (error) {
    console.error("Subpadi Validate IUC Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// GET /api/validatemeter - Validate Meter
export async function subpadiValidateMeter(
  meterNumber: string, discoName: number, meterType: number
): Promise<SubpadiResponse> {
  try {
    const url = `${SUBPADI_BASE_URL}/validatemeter?meternumber=${meterNumber}&disconame=${discoName}&mtype=${meterType}`;
    const response = await fetchWithRetry(url, {
      method: "GET",
      headers: getHeaders(),
    });
    const data = await response.json();
    console.log("Subpadi Validate Meter Response:", JSON.stringify(data));
    return {
      success: response.ok,
      message: data?.message || (response.ok ? "Validation successful" : "Validation failed"),
      rawResponse: data,
    };
  } catch (error) {
    console.error("Subpadi Validate Meter Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}
