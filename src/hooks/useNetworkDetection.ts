import { useState, useEffect, useCallback } from "react";

// Nigerian mobile network prefixes (comprehensive list)
// Compatible with SUBPADI API network values: mtn, airtel, glo, 9mobile
const NETWORK_PREFIXES: Record<string, string[]> = {
  mtn: [
    "0803", "0806", "0703", "0706", "0813", "0816", "0810", 
    "0814", "0903", "0906", "0913", "0916", "07025", "07026",
    "0704"
  ],
  airtel: [
    "0802", "0808", "0708", "0812", "0701", "0902", "0901", 
    "0907", "0912"
  ],
  glo: [
    "0805", "0807", "0705", "0815", "0811", "0905", "0915"
  ],
  "9mobile": [
    "0809", "0818", "0817", "0909", "0908"
  ]
};

// Network display information
export const NETWORK_INFO: Record<string, { name: string; color: string; subpadiCode: string }> = {
  mtn: { name: "MTN", color: "bg-yellow-500", subpadiCode: "mtn" },
  airtel: { name: "Airtel", color: "bg-red-500", subpadiCode: "airtel" },
  glo: { name: "Glo", color: "bg-green-500", subpadiCode: "glo" },
  "9mobile": { name: "9Mobile", color: "bg-green-700", subpadiCode: "9mobile" }
};

export interface NetworkDetectionResult {
  network: string | null;
  networkInfo: typeof NETWORK_INFO[string] | null;
  isValid: boolean;
  normalizedNumber: string;
  error: string | null;
}

/**
 * Normalizes Nigerian phone number to local format (0XXXXXXXXXX)
 */
export const normalizePhoneNumber = (phone: string): string => {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, "");
  
  // Handle +234 format
  if (cleaned.startsWith("234") && cleaned.length === 13) {
    cleaned = "0" + cleaned.slice(3);
  }
  
  // Handle 234 format without +
  if (cleaned.startsWith("234") && cleaned.length === 13) {
    cleaned = "0" + cleaned.slice(3);
  }
  
  return cleaned;
};

/**
 * Validates Nigerian phone number format
 */
export const validatePhoneNumber = (phone: string): { isValid: boolean; error: string | null } => {
  const normalized = normalizePhoneNumber(phone);
  
  if (!normalized) {
    return { isValid: false, error: null };
  }
  
  if (normalized.length < 11) {
    return { isValid: false, error: "Phone number is incomplete" };
  }
  
  if (normalized.length > 11) {
    return { isValid: false, error: "Phone number is too long" };
  }
  
  if (!normalized.startsWith("0")) {
    return { isValid: false, error: "Invalid phone number format" };
  }
  
  return { isValid: true, error: null };
};

/**
 * Detects network from Nigerian phone number prefix
 */
export const detectNetwork = (phone: string): string | null => {
  const normalized = normalizePhoneNumber(phone);
  
  if (normalized.length < 4) return null;
  
  // Check 5-digit prefixes first (more specific)
  const prefix5 = normalized.slice(0, 5);
  for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES)) {
    if (prefixes.includes(prefix5)) {
      return network;
    }
  }
  
  // Then check 4-digit prefixes
  const prefix4 = normalized.slice(0, 4);
  for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES)) {
    if (prefixes.includes(prefix4)) {
      return network;
    }
  }
  
  return null;
};

/**
 * Hook for real-time Nigerian network detection
 */
export const useNetworkDetection = (phoneNumber: string): NetworkDetectionResult => {
  const [result, setResult] = useState<NetworkDetectionResult>({
    network: null,
    networkInfo: null,
    isValid: false,
    normalizedNumber: "",
    error: null
  });

  useEffect(() => {
    const normalized = normalizePhoneNumber(phoneNumber);
    const validation = validatePhoneNumber(phoneNumber);
    const network = detectNetwork(phoneNumber);
    
    setResult({
      network,
      networkInfo: network ? NETWORK_INFO[network] : null,
      isValid: validation.isValid && network !== null,
      normalizedNumber: normalized,
      error: validation.error || (normalized.length >= 4 && !network ? "Unknown network" : null)
    });
  }, [phoneNumber]);

  return result;
};

/**
 * Get all supported networks
 */
export const getSupportedNetworks = () => {
  return Object.entries(NETWORK_INFO).map(([id, info]) => ({
    id,
    ...info
  }));
};

export default useNetworkDetection;
