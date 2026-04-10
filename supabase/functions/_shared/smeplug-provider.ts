// SMEPlug API Provider
// Base URL: https://smeplug.ng/api/v1
// Auth: Authorization: Bearer {SMEPLUG_API_KEY}

const SMEPLUG_BASE_URL = "https://smeplug.ng/api/v1";
const SMEPLUG_TIMEOUT_MS = 15000;
const SMEPLUG_MAX_RETRIES = 2;

function getHeaders(): Record<string, string> {
  const apiKey = Deno.env.get("SMEPLUG_API_KEY");
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

export function isSmeplugConfigured(): boolean {
  return !!Deno.env.get("SMEPLUG_API_KEY");
}

export interface SmeplugResponse {
  success: boolean;
  message: string;
  rawResponse: unknown;
  reference?: string;
  token?: string;
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// Fetch with timeout and retry
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = SMEPLUG_MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SMEPLUG_TIMEOUT_MS);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`SMEPlug request attempt ${attempt + 1}/${retries + 1} failed:`, lastError.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
      }
    }
  }
  throw lastError || new Error("SMEPlug API request failed after retries");
}

function normalizeResult(data: any, httpOk: boolean): Pick<SmeplugResponse, "success" | "message"> {
  const status = String(data?.status ?? "").toLowerCase();
  const success = httpOk && (
    data?.status === true ||
    data?.success === true ||
    status === "success" ||
    status === "successful" ||
    status === "true"
  );

  const message = data?.data?.msg || data?.message || data?.msg || data?.error || data?.detail ||
    (success ? "Transaction successful" : "Transaction failed");

  return { success, message: String(message) };
}

// ─── Network mapping (per SMEPlug docs: 1=MTN, 2=Airtel, 3=9Mobile, 4=Glo) ───
const SMEPLUG_NETWORK_MAP: Record<string, number> = {
  'MTN': 1,
  'AIRTEL': 2,
  '9MOBILE': 3,
  'ETISALAT': 3,
  'GLO': 4,
};

export function getSmeplugNetworkId(network: string): number | null {
  return SMEPLUG_NETWORK_MAP[network.toUpperCase()] || null;
}

// ─── GET /user/balance ───
export async function smeplugGetBalance(): Promise<SmeplugResponse> {
  try {
    const response = await fetchWithRetry(`${SMEPLUG_BASE_URL}/account/balance`, {
      method: "GET",
      headers: getHeaders(),
    });
    const data = await response.json();
    console.log("SMEPlug Balance Response:", JSON.stringify(data));
    return {
      success: response.ok,
      message: response.ok ? "Balance retrieved" : (data?.message || "Failed to get balance"),
      rawResponse: data,
    };
  } catch (error) {
    console.error("SMEPlug Balance Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// ─── POST /airtime ───
export async function smeplugPurchaseAirtime(
  network: string, phone: string, amount: number
): Promise<SmeplugResponse> {
  const networkId = getSmeplugNetworkId(network);
  if (!networkId) return { success: false, message: "Invalid network for SMEPlug", rawResponse: null };

  try {
    const body = { network_id: networkId, phone, amount };
    console.log("SMEPlug Airtime Request:", JSON.stringify(body));
    const response = await fetchWithRetry(`${SMEPLUG_BASE_URL}/airtime/purchase`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const data = parseJson(text);
    console.log("SMEPlug Airtime Response:", JSON.stringify(data));
    const result = normalizeResult(data, response.ok);
    return {
      ...result,
      rawResponse: data,
      reference: data?.data?.reference || data?.reference || data?.transaction_id,
    };
  } catch (error) {
    console.error("SMEPlug Airtime Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// ─── POST /data ───
export async function smeplugPurchaseData(
  network: string, phone: string, planId: string
): Promise<SmeplugResponse> {
  const networkId = getSmeplugNetworkId(network);
  if (!networkId) return { success: false, message: "Invalid network for SMEPlug", rawResponse: null };

  try {
    const body = { network_id: networkId, plan_id: planId, phone };
    console.log("SMEPlug Data Request:", JSON.stringify(body));
    const response = await fetchWithRetry(`${SMEPLUG_BASE_URL}/data/purchase`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const data = parseJson(text);
    console.log("SMEPlug Data Response:", JSON.stringify(data));
    const result = normalizeResult(data, response.ok);
    return {
      ...result,
      rawResponse: data,
      reference: data?.data?.reference || data?.reference || data?.transaction_id,
    };
  } catch (error) {
    console.error("SMEPlug Data Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

// ─── POST /airtime/recharge-card (PIN generation) ───
export async function smeplugPurchaseRechargeCard(
  network: string, amount: number, quantity: number
): Promise<SmeplugResponse & { pins?: Array<{ pin: string; serial?: string; network: string; amount: number }> }> {
  const networkId = getSmeplugNetworkId(network);
  if (!networkId) return { success: false, message: "Invalid network for SMEPlug", rawResponse: null, pins: [] };

  try {
    const body = { network_id: networkId, amount, quantity };
    console.log("SMEPlug Recharge Card Request:", JSON.stringify(body));
    const response = await fetchWithRetry(`${SMEPLUG_BASE_URL}/airtime/recharge-card/purchase`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const data = parseJson(text);
    console.log("SMEPlug Recharge Card Response:", JSON.stringify(data));
    const result = normalizeResult(data, response.ok);

    // Extract PINs from response
    const pins: Array<{ pin: string; serial?: string; network: string; amount: number }> = [];
    const rawPins = data?.data?.pins || data?.data?.cards || data?.data?.recharge_cards
      || data?.pins || data?.cards || (Array.isArray(data?.data) ? data.data : []);
    const pinArray = Array.isArray(rawPins) ? rawPins : rawPins ? [rawPins] : [];
    for (const item of pinArray) {
      if (typeof item === 'string') pins.push({ pin: item, network: network.toUpperCase(), amount });
      else if (item?.pin) pins.push({ pin: item.pin, serial: item.serial || item.serial_number, network: network.toUpperCase(), amount });
      else if (item?.token) pins.push({ pin: item.token, serial: item.serial, network: network.toUpperCase(), amount });
    }
    // Single PIN fallback
    if (pins.length === 0) {
      const singlePin = data?.data?.pin || data?.pin || data?.data?.token || data?.token;
      if (singlePin) pins.push({ pin: singlePin, serial: data?.data?.serial || data?.serial, network: network.toUpperCase(), amount });
    }

    return {
      ...result,
      rawResponse: data,
      reference: data?.data?.reference || data?.reference || data?.transaction_id,
      pins,
    };
  } catch (error) {
    console.error("SMEPlug Recharge Card Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null, pins: [] };
  }
}

// ─── GET /data/plans ───
export async function smeplugGetDataPlans(): Promise<SmeplugResponse> {
  try {
    const response = await fetchWithRetry(`${SMEPLUG_BASE_URL}/data/plans`, {
      method: "GET",
      headers: getHeaders(),
    });
    const data = await response.json();
    console.log("SMEPlug Data Plans Response (count):", Array.isArray(data?.data) ? data.data.length : 'non-array');
    return {
      success: response.ok,
      message: response.ok ? "Plans retrieved" : (data?.message || "Failed to get plans"),
      rawResponse: data,
    };
  } catch (error) {
    console.error("SMEPlug Data Plans Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}
    });
    const data = await response.json();
    console.log("SMEPlug Data Plans Response (count):", Array.isArray(data?.data) ? data.data.length : 'non-array');
    return {
      success: response.ok,
      message: response.ok ? "Plans retrieved" : (data?.message || "Failed to get plans"),
      rawResponse: data,
    };
  } catch (error) {
    console.error("SMEPlug Data Plans Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}
