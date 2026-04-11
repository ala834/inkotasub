// ClubKonnect API Provider
// Base URL: https://www.clubkonnect.com/
// Auth: UserID + APIKey as query parameters (HTTPS GET API)

const CLUBKONNECT_BASE_URL = "https://www.clubkonnect.com";
const CLUBKONNECT_TIMEOUT_MS = 15000;
const CLUBKONNECT_MAX_RETRIES = 2;

export interface ClubkonnectResponse {
  success: boolean;
  message: string;
  rawResponse: unknown;
  reference?: string;
  token?: string;
  pins?: Array<{ pin: string; serial?: string; network: string; amount: number }>;
}

// Network mapping: MTN=01, GLO=02, 9mobile/Etisalat=03, Airtel=04
const CLUBKONNECT_NETWORK_MAP: Record<string, string> = {
  'MTN': '01',
  'GLO': '02',
  '9MOBILE': '03',
  'ETISALAT': '03',
  'AIRTEL': '04',
};

export function getClubkonnectNetworkCode(network: string): string | null {
  return CLUBKONNECT_NETWORK_MAP[network.toUpperCase()] || null;
}

function getCredentials(): { userId: string; apiKey: string } | null {
  const userId = Deno.env.get("CLUBKONNECT_USER_ID");
  const apiKey = Deno.env.get("CLUBKONNECT_API_KEY");
  if (!userId || !apiKey) return null;
  return { userId, apiKey };
}

export function isClubkonnectConfigured(): boolean {
  return !!Deno.env.get("CLUBKONNECT_USER_ID") && !!Deno.env.get("CLUBKONNECT_API_KEY");
}

function buildUrl(endpoint: string, params: Record<string, string>): string {
  const creds = getCredentials();
  if (!creds) throw new Error("ClubKonnect credentials not configured");
  const allParams = { UserID: creds.userId, APIKey: creds.apiKey, ...params };
  const query = Object.entries(allParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${CLUBKONNECT_BASE_URL}/${endpoint}?${query}`;
}

async function fetchWithRetry(url: string, retries = CLUBKONNECT_MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CLUBKONNECT_TIMEOUT_MS);
      const response = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`ClubKonnect request attempt ${attempt + 1}/${retries + 1} failed:`, lastError.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
      }
    }
  }
  throw lastError || new Error("ClubKonnect API request failed after retries");
}

function parseResponse(data: any): { success: boolean; message: string } {
  const statusCode = data?.statusCode ?? data?.StatusCode ?? 0;
  const status = String(data?.status ?? "").toUpperCase();
  const remark = data?.remark ?? data?.Remark ?? "";
  const description = data?.description ?? data?.Description ?? "";

  // Success: statusCode 200 means ORDER_COMPLETED + Success
  const success = statusCode === 200 || status === "ORDER_COMPLETED" && remark === "Success";

  // Pending states (100, 300) — treat as failure for now (user gets refund, reconciliation picks up later)
  const message = description || remark || (success ? "Transaction successful" : "Transaction failed");

  return { success, message: String(message) };
}

function generateRequestId(): string {
  return `CK${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

// ─── Get Wallet Balance ───
export async function clubkonnectGetBalance(): Promise<ClubkonnectResponse> {
  try {
    const url = buildUrl("APIWalletBalanceV1.asp", {});
    const response = await fetchWithRetry(url);
    const data = await response.json();
    console.log("ClubKonnect Balance Response:", JSON.stringify(data));
    return {
      success: response.ok,
      message: response.ok ? "Balance retrieved" : (data?.message || "Failed to get balance"),
      rawResponse: data,
    };
  } catch (error) {
    console.error("ClubKonnect Balance Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// ─── Buy Airtime ───
export async function clubkonnectPurchaseAirtime(
  network: string, phoneNumber: string, amount: number
): Promise<ClubkonnectResponse> {
  const networkCode = getClubkonnectNetworkCode(network);
  if (!networkCode) return { success: false, message: "Invalid network for ClubKonnect", rawResponse: null };

  try {
    const requestId = generateRequestId();
    const url = buildUrl("APIAirtimeV1.asp", {
      MobileNetwork: networkCode,
      Amount: String(amount),
      MobileNumber: phoneNumber,
      RequestID: requestId,
    });
    console.log("ClubKonnect Airtime Request - network:", network, "phone:", phoneNumber, "amount:", amount);
    const response = await fetchWithRetry(url);
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 500) }; }
    console.log("ClubKonnect Airtime Response:", JSON.stringify(data));
    const result = parseResponse(data);
    return {
      success: result.success,
      message: result.message,
      rawResponse: data,
      reference: data?.orderId || data?.OrderID || requestId,
    };
  } catch (error) {
    console.error("ClubKonnect Airtime Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// ─── Buy Data ───
export async function clubkonnectPurchaseData(
  network: string, phoneNumber: string, planId: string
): Promise<ClubkonnectResponse> {
  const networkCode = getClubkonnectNetworkCode(network);
  if (!networkCode) return { success: false, message: "Invalid network for ClubKonnect", rawResponse: null };

  try {
    const requestId = generateRequestId();
    const url = buildUrl("APIDatabundleV1.asp", {
      MobileNetwork: networkCode,
      DataPlan: planId,
      MobileNumber: phoneNumber,
      RequestID: requestId,
    });
    console.log("ClubKonnect Data Request - network:", network, "plan:", planId, "phone:", phoneNumber);
    const response = await fetchWithRetry(url);
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 500) }; }
    console.log("ClubKonnect Data Response:", JSON.stringify(data));
    const result = parseResponse(data);
    return {
      success: result.success,
      message: result.message,
      rawResponse: data,
      reference: data?.orderId || data?.OrderID || requestId,
    };
  } catch (error) {
    console.error("ClubKonnect Data Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// ─── Get Data Plans ───
export async function clubkonnectGetDataPlans(): Promise<ClubkonnectResponse> {
  try {
    const url = buildUrl("APIDatabundlePlansV1.asp", {});
    const response = await fetchWithRetry(url);
    const data = await response.json();
    console.log("ClubKonnect Data Plans Response:", JSON.stringify(data).substring(0, 500));
    return {
      success: response.ok,
      message: response.ok ? "Plans retrieved" : (data?.message || "Failed to get plans"),
      rawResponse: data,
    };
  } catch (error) {
    console.error("ClubKonnect Data Plans Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// ─── Buy Airtime E-PIN (Recharge Card) ───
export async function clubkonnectPurchaseEPIN(
  network: string, amount: number, quantity: number
): Promise<ClubkonnectResponse> {
  const networkCode = getClubkonnectNetworkCode(network);
  if (!networkCode) return { success: false, message: "Invalid network for ClubKonnect", rawResponse: null, pins: [] };

  try {
    const requestId = generateRequestId();
    const url = buildUrl("APIGetEPINV1.asp", {
      MobileNetwork: networkCode,
      Value: String(amount),
      Quantity: String(quantity),
      RequestID: requestId,
    });
    console.log("ClubKonnect EPIN Request - network:", network, "amount:", amount, "qty:", quantity);
    const response = await fetchWithRetry(url);
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 500) }; }
    console.log("ClubKonnect EPIN Response:", JSON.stringify(data));
    const result = parseResponse(data);

    // Extract PINs from response
    const pins: Array<{ pin: string; serial?: string; network: string; amount: number }> = [];
    const rawPins = data?.pins || data?.Pins || data?.cards || data?.data?.pins 
      || (Array.isArray(data?.data) ? data.data : null) || [];
    const pinArray = Array.isArray(rawPins) ? rawPins : rawPins ? [rawPins] : [];
    
    for (const item of pinArray) {
      if (typeof item === "string") {
        pins.push({ pin: item, network: network.toUpperCase(), amount });
      } else if (item?.pin || item?.Pin || item?.PIN) {
        pins.push({
          pin: item.pin || item.Pin || item.PIN,
          serial: item.serial || item.Serial || item.serialNumber || item.SerialNumber,
          network: network.toUpperCase(),
          amount,
        });
      } else if (item?.instructions?.pin) {
        pins.push({
          pin: item.instructions.pin,
          serial: item.instructions.serial || item.instructions.serialNumber,
          network: network.toUpperCase(),
          amount,
        });
      }
    }

    // Single PIN fallback
    if (pins.length === 0) {
      const singlePin = data?.pin || data?.Pin || data?.PIN || data?.data?.pin;
      if (singlePin) {
        pins.push({
          pin: singlePin,
          serial: data?.serial || data?.Serial || data?.data?.serial,
          network: network.toUpperCase(),
          amount,
        });
      }
    }

    return {
      success: result.success,
      message: result.message,
      rawResponse: data,
      reference: data?.orderId || data?.OrderID || requestId,
      pins,
    };
  } catch (error) {
    console.error("ClubKonnect EPIN Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null, pins: [] };
  }
}
