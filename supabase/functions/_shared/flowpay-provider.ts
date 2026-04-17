// Flowpay API Provider
// Base URL: https://api.flowpay.ng
// Auth: Authorization: Bearer {FLOWPAY_API_KEY}
// Docs: https://app.flowpay.ng/developer

const FLOWPAY_BASE_URL = "https://api.flowpay.ng";
const FLOWPAY_TIMEOUT_MS = 20000;
const FLOWPAY_MAX_RETRIES = 1;

// Network code mapping (Flowpay uses numeric IDs)
const NETWORK_CODES: Record<string, number> = {
  MTN: 1,
  AIRTEL: 2,
  GLO: 3,
  "9MOBILE": 4,
  ETISALAT: 4,
};

function getHeaders(): Record<string, string> {
  const apiKey = Deno.env.get("FLOWPAY_API_KEY");
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

export function isFlowpayConfigured(): boolean {
  return !!Deno.env.get("FLOWPAY_API_KEY");
}

export interface FlowpayResponse {
  success: boolean;
  message: string;
  rawResponse: unknown;
  reference?: string;
  token?: string;
}

function parseJson(text: string): any {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = FLOWPAY_MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FLOWPAY_TIMEOUT_MS);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Flowpay request attempt ${attempt + 1}/${retries + 1} failed:`, lastError.message);
      if (attempt < retries) await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
    }
  }
  throw lastError || new Error("Flowpay request failed");
}

export async function flowpayPurchaseData(
  network: string,
  phoneNumber: string,
  planId: string,
): Promise<FlowpayResponse> {
  if (!isFlowpayConfigured()) {
    return { success: false, message: "Flowpay not configured", rawResponse: null };
  }

  const networkCode = NETWORK_CODES[network.toUpperCase()];
  if (!networkCode) {
    return { success: false, message: `Unsupported network for Flowpay: ${network}`, rawResponse: null };
  }

  try {
    const body = {
      mobile_number: phoneNumber,
      plan: planId,
      network: networkCode,
    };

    console.log(`Flowpay data purchase:`, body);

    const response = await fetchWithRetry(`${FLOWPAY_BASE_URL}/api/data`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = parseJson(text);
    console.log(`Flowpay response (${response.status}):`, data);

    const success = response.ok && (data?.status === true || data?.status === "success" || data?.success === true);
    const message = data?.message || (success ? "Data purchase successful" : `Flowpay error (${response.status})`);
    const reference = data?.reference || data?.transaction_id || data?.data?.reference;

    return { success, message, rawResponse: data, reference };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Flowpay request failed";
    console.error("Flowpay purchase error:", msg);
    return { success: false, message: msg, rawResponse: { error: msg } };
  }
}

// Health/balance check — Flowpay docs don't expose a public balance endpoint
// We ping the base URL to verify reachability
export async function flowpayGetBalance(): Promise<FlowpayResponse> {
  if (!isFlowpayConfigured()) {
    return { success: false, message: "Flowpay not configured", rawResponse: null };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const startedAt = Date.now();
    const response = await fetch(`${FLOWPAY_BASE_URL}/api/user`, {
      method: "GET",
      headers: getHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const elapsed = Date.now() - startedAt;
    const text = await response.text().catch(() => "");
    const data = parseJson(text);
    return {
      success: response.ok,
      message: response.ok ? "Connected" : `HTTP ${response.status}`,
      rawResponse: { ...data, latency_ms: elapsed, status: response.status },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Flowpay unreachable";
    return { success: false, message: msg, rawResponse: { error: msg } };
  }
}
