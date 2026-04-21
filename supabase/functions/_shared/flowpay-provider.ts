// Flowpay API Provider
// Base URL: https://api.flowpay.ng
// Auth: Authorization: Bearer {FLOWPAY_API_KEY}
// Docs: https://app.flowpay.ng/developer

const FLOWPAY_BASE_URL = "https://app.flowpay.ng/api";
const FLOWPAY_TIMEOUT_MS = 30000;
const FLOWPAY_MAX_RETRIES = 2;

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FLOWPAY_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));
      const isAbort = lastError.name === "AbortError" || /aborted/i.test(lastError.message);
      const kind = isAbort ? "TIMEOUT" : /fetch|network/i.test(lastError.message) ? "NETWORK" : "ERROR";
      console.error(`[Flowpay] attempt ${attempt + 1}/${retries + 1} ${kind}: ${lastError.message}`);
      if (attempt < retries) await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
    }
  }
  throw lastError || new Error("Flowpay request failed");
}

// Normalize a Nigerian phone number to local 11-digit format: 0XXXXXXXXXX
// Accepts: 080..., 23480..., +23480..., 80...
function normalizePhone(input: string): string | null {
  if (!input) return null;
  let p = String(input).replace(/[^\d]/g, ""); // strip non-digits (also drops +)
  if (p.startsWith("234")) p = "0" + p.slice(3);
  if (p.length === 10 && !p.startsWith("0")) p = "0" + p; // bare 8012345678
  if (!/^0\d{10}$/.test(p)) return null;
  return p;
}

// Extract a meaningful error message from Flowpay's various error shapes.
// Flowpay (Laravel) commonly returns 422 with: { message: "...", errors: { field: ["msg"] } }
function extractFlowpayError(data: any, httpStatus: number): string {
  if (!data || typeof data !== "object") return `Flowpay error (HTTP ${httpStatus})`;
  const inner = (data.data && typeof data.data === "object") ? data.data : null;
  // Laravel-style validation errors
  if (data.errors && typeof data.errors === "object") {
    const firstKey = Object.keys(data.errors)[0];
    if (firstKey) {
      const arr = data.errors[firstKey];
      const msg = Array.isArray(arr) ? arr[0] : String(arr);
      if (msg) return `${msg} (${firstKey})`;
    }
  }
  const msg = data.message || data.error || data.error_message
    || inner?.message || inner?.error
    || (typeof data.errors === "string" ? data.errors : null);
  return msg || `Flowpay error (HTTP ${httpStatus})`;
}

export async function flowpayPurchaseData(
  network: string,
  phoneNumber: string,
  planId: string,
  amount?: number,
): Promise<FlowpayResponse> {
  if (!isFlowpayConfigured()) {
    return { success: false, message: "Flowpay not configured", rawResponse: null };
  }

  // ─── Input validation ──────────────────────────────────────────────────
  const networkUpper = String(network || "").toUpperCase().trim();
  const networkCode = NETWORK_CODES[networkUpper];
  if (!networkCode) {
    return { success: false, message: `Unsupported network for Flowpay: ${network}`, rawResponse: null };
  }
  const normalizedPhone = normalizePhone(phoneNumber);
  if (!normalizedPhone) {
    return { success: false, message: `Invalid phone number for Flowpay: ${phoneNumber}`, rawResponse: null };
  }
  const cleanedPlanId = String(planId || "").trim();
  if (!cleanedPlanId) {
    return { success: false, message: "Flowpay plan_id is required", rawResponse: null };
  }

  try {
    const body: Record<string, unknown> = {
      mobile_number: normalizedPhone,
      plan: cleanedPlanId,
      network: networkCode,
    };
    if (typeof amount === "number" && amount > 0) {
      body.amount = amount;
    }

    console.log(`[Flowpay] POST ${FLOWPAY_BASE_URL}/data request:`, JSON.stringify(body));

    const response = await fetchWithRetry(`${FLOWPAY_BASE_URL}/data`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = parseJson(text);
    console.log(`[Flowpay] response (HTTP ${response.status}):`, text.slice(0, 1000));

    // Flowpay returns 422 for validation errors — surface the exact reason.
    if (response.status === 422) {
      const errMsg = extractFlowpayError(data, 422);
      console.error(`[Flowpay] 422 validation failure:`, errMsg, "request was:", JSON.stringify(body));
      return { success: false, message: `Flowpay: ${errMsg}`, rawResponse: data };
    }
    if (response.status >= 400 && response.status !== 422) {
      const errMsg = extractFlowpayError(data, response.status);
      console.error(`[Flowpay] HTTP ${response.status} failure:`, errMsg);
      return { success: false, message: `Flowpay: ${errMsg}`, rawResponse: data };
    }

    // Robust success detection — Flowpay may use different shapes:
    //   { status: true, message: "...", reference: "..." }
    //   { status: "success" | "successful" | "completed", ... }
    //   { success: true, ... }
    //   { data: { status: true | "success", ... } }
    //   { code: 200 | "00", ... }
    const inner = (data && typeof data === "object" && data.data && typeof data.data === "object") ? data.data : null;
    const statusCandidates: unknown[] = [
      data?.status, data?.success, data?.code, data?.Status,
      inner?.status, inner?.success, inner?.code,
    ];
    const isTruthyStatus = (v: unknown): boolean => {
      if (v === true) return true;
      if (typeof v === "number") return v === 200 || v === 1;
      if (typeof v === "string") {
        const s = v.toLowerCase().trim();
        return ["success", "successful", "completed", "delivered", "true", "ok", "00", "200"].includes(s);
      }
      return false;
    };
    const isFailureStatus = (v: unknown): boolean => {
      if (v === false) return true;
      if (typeof v === "string") {
        const s = v.toLowerCase().trim();
        return ["failed", "failure", "error", "rejected", "declined", "false"].includes(s);
      }
      return false;
    };

    const explicitSuccess = statusCandidates.some(isTruthyStatus);
    const explicitFailure = statusCandidates.some(isFailureStatus);
    // If HTTP 200 and no explicit failure marker but a reference exists, treat as success.
    const reference = data?.reference || data?.transaction_id || data?.trans_id || data?.txn_id
      || inner?.reference || inner?.transaction_id || inner?.trans_id;
    const success = explicitSuccess || (response.ok && !explicitFailure && !!reference);

    const message = success
      ? (data?.message || inner?.message || "Data purchase successful")
      : `Flowpay: ${extractFlowpayError(data, response.status)}`;

    console.log(`Flowpay decision: success=${success} explicitSuccess=${explicitSuccess} explicitFailure=${explicitFailure} reference=${reference || "none"} httpOk=${response.ok}`);

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
    // Flowpay has no documented balance endpoint — ping the base host to verify reachability.
    // Any 2xx/3xx/4xx response (i.e. server reachable) counts as "connected".
    const response = await fetch("https://app.flowpay.ng/", {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const elapsed = Date.now() - startedAt;
    const reachable = response.status > 0 && response.status < 500;
    return {
      success: reachable,
      message: reachable ? "Connected" : `HTTP ${response.status}`,
      rawResponse: { latency_ms: elapsed, status: response.status, host: "app.flowpay.ng" },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Flowpay unreachable";
    return { success: false, message: msg, rawResponse: { error: msg } };
  }
}
