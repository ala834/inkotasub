// Subpadi API Provider
// Base URL: https://subpadi.com/api/v1/
// Auth: Authorization: Token {SUBPADI_API_TOKEN}

const SUBPADI_BASE_URL = "https://subpadi.com/api/v1";

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

export async function subpadiPurchaseAirtime(
  network: string, phoneNumber: string, amount: number
): Promise<SubpadiResponse> {
  const networkId = getSubpadiNetworkId(network);
  if (!networkId) return { success: false, message: "Invalid network", rawResponse: null };

  try {
    const response = await fetch(`${SUBPADI_BASE_URL}/airtime/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ network_id: networkId, phone: phoneNumber, amount }),
    });
    const data = await response.json();
    console.log("Subpadi Airtime Response:", data);
    const success = data?.status === "success" || data?.success === true;
    return {
      success,
      message: data?.message || (success ? "Airtime purchased" : "Purchase failed"),
      rawResponse: data,
      reference: data?.reference || data?.data?.reference,
    };
  } catch (error) {
    console.error("Subpadi Airtime Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

export async function subpadiPurchaseData(
  network: string, phoneNumber: string, planId: string, amount: number
): Promise<SubpadiResponse> {
  const networkId = getSubpadiNetworkId(network);
  if (!networkId) return { success: false, message: "Invalid network", rawResponse: null };

  try {
    const response = await fetch(`${SUBPADI_BASE_URL}/data/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ network_id: networkId, plan_id: planId, phone: phoneNumber }),
    });
    const data = await response.json();
    console.log("Subpadi Data Response:", data);
    const success = data?.status === "success" || data?.success === true;
    return {
      success,
      message: data?.message || (success ? "Data purchased" : "Purchase failed"),
      rawResponse: data,
      reference: data?.reference || data?.data?.reference,
    };
  } catch (error) {
    console.error("Subpadi Data Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

export async function subpadiPurchaseCable(
  serviceId: string, smartcardNumber: string, planId: string, amount: number
): Promise<SubpadiResponse> {
  try {
    const response = await fetch(`${SUBPADI_BASE_URL}/cable/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ service_id: serviceId, smartcard_number: smartcardNumber, plan_id: planId }),
    });
    const data = await response.json();
    console.log("Subpadi Cable Response:", data);
    const success = data?.status === "success" || data?.success === true;
    return {
      success,
      message: data?.message || (success ? "Cable subscription successful" : "Subscription failed"),
      rawResponse: data,
      reference: data?.reference || data?.data?.reference,
    };
  } catch (error) {
    console.error("Subpadi Cable Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

export async function subpadiPurchaseElectricity(
  discoId: string, meterNumber: string, amount: number, meterType: string
): Promise<SubpadiResponse> {
  try {
    const response = await fetch(`${SUBPADI_BASE_URL}/electricity/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ disco_id: discoId, meter_number: meterNumber, amount, meter_type: meterType.toLowerCase() }),
    });
    const data = await response.json();
    console.log("Subpadi Electricity Response:", data);
    const success = data?.status === "success" || data?.success === true;
    const token = data?.data?.token || data?.token;
    return {
      success,
      message: data?.message || (success ? "Electricity purchased" : "Purchase failed"),
      rawResponse: data,
      reference: data?.reference || data?.data?.reference,
      token,
    };
  } catch (error) {
    console.error("Subpadi Electricity Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}

export async function subpadiPurchaseExamPin(
  examType: string, quantity: number
): Promise<SubpadiResponse> {
  try {
    const response = await fetch(`${SUBPADI_BASE_URL}/exam/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ exam_type: examType, quantity }),
    });
    const data = await response.json();
    console.log("Subpadi Exam Response:", data);
    const success = data?.status === "success" || data?.success === true;
    return {
      success,
      message: data?.message || (success ? "Exam card purchased" : "Purchase failed"),
      rawResponse: data,
      reference: data?.reference || data?.data?.reference,
    };
  } catch (error) {
    console.error("Subpadi Exam Error:", error);
    return { success: false, message: error instanceof Error ? error.message : "API error", rawResponse: null };
  }
}
