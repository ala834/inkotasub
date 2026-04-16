// Render Backend Provider
// Base URL: https://inkotasub-backend.onrender.com

const RENDER_BASE_URL = "https://inkotasub-backend.onrender.com";
const RENDER_TIMEOUT_MS = 15000;

export interface RenderResponse {
  success: boolean;
  message: string;
  rawResponse: unknown;
  reference?: string;
  token?: string;
}

export function isRenderConfigured(): boolean {
  // Render backend doesn't need an API key stored as secret — it's a public endpoint
  return true;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function renderPurchaseAirtime(
  network: string,
  phoneNumber: string,
  amount: number,
): Promise<RenderResponse> {
  try {
    console.log(`[Render] Purchasing airtime: ${network} ${phoneNumber} ₦${amount}`);
    const response = await fetchWithTimeout(`${RENDER_BASE_URL}/buy-airtime`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: network.toUpperCase(), phone: phoneNumber, amount }),
    });

    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log(`[Render] Airtime response (${response.status}):`, JSON.stringify(data));

    const success = response.ok && (data?.success !== false && data?.status !== "failed");
    return {
      success,
      message: success
        ? (data?.message || "Airtime purchase successful")
        : (data?.message || data?.error || "Airtime purchase failed via Render backend"),
      rawResponse: data,
      reference: data?.reference || data?.transactionId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Render] Airtime error:", msg);
    return {
      success: false,
      message: `Render backend error: ${msg}`,
      rawResponse: null,
    };
  }
}

export async function renderPurchaseData(
  network: string,
  phoneNumber: string,
  planId: string | number,
  amount?: number,
): Promise<RenderResponse> {
  try {
    console.log(`[Render] Purchasing data: ${network} ${phoneNumber} plan=${planId}`);
    const response = await fetchWithTimeout(`${RENDER_BASE_URL}/buy-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: network.toUpperCase(), phone: phoneNumber, plan: String(planId) }),
    });

    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log(`[Render] Data response (${response.status}):`, JSON.stringify(data));

    const success = response.ok && (data?.success !== false && data?.status !== "failed");
    return {
      success,
      message: success
        ? (data?.message || "Data purchase successful")
        : (data?.message || data?.error || "Data purchase failed via Render backend"),
      rawResponse: data,
      reference: data?.reference || data?.transactionId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Render] Data error:", msg);
    return {
      success: false,
      message: `Render backend error: ${msg}`,
      rawResponse: null,
    };
  }
}
