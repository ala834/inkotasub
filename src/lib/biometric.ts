import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Device } from "@capacitor/device";

// Types
interface BiometricResult {
  success: boolean;
  error?: string;
}

interface StoredCredentials {
  email?: string;
  password?: string;
  deviceId: string;
}

const BIOMETRIC_ENABLED_KEY = "biometric_login_enabled";
const BIOMETRIC_TRANSACTION_KEY = "biometric_transaction_enabled";
const STORED_CREDENTIALS_KEY = "biometric_credentials";
const FAILED_ATTEMPTS_KEY = "biometric_failed_attempts";
const MAX_BIOMETRIC_ATTEMPTS = 3;

/**
 * Check if biometric authentication is available on the device
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    const { NativeBiometric } = await import("capacitor-native-biometric");
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
  } catch {
    return false;
  }
}

/**
 * Get a unique device identifier for device binding
 */
export async function getDeviceId(): Promise<string> {
  try {
    const info = await Device.getId();
    return info.identifier;
  } catch {
    // Fallback for web: generate and persist a UUID
    const { value } = await Preferences.get({ key: "device_uuid" });
    if (value) return value;
    const uuid = crypto.randomUUID();
    await Preferences.set({ key: "device_uuid", value: uuid });
    return uuid;
  }
}

/**
 * Get device info for display purposes
 */
export async function getDeviceInfo(): Promise<{ name: string; platform: string }> {
  try {
    const info = await Device.getInfo();
    return {
      name: `${info.manufacturer || ""} ${info.model || info.name || "Unknown"}`.trim(),
      platform: info.platform,
    };
  } catch {
    return { name: "Web Browser", platform: "web" };
  }
}

/**
 * Perform biometric authentication (fingerprint/face)
 */
export async function authenticateWithBiometric(
  reason = "Verify your identity"
): Promise<BiometricResult> {
  if (!Capacitor.isNativePlatform()) {
    return { success: false, error: "Biometric only available on native devices" };
  }

  try {
    const { NativeBiometric } = await import("capacitor-native-biometric");
    await NativeBiometric.verifyIdentity({
      reason,
      title: "INKOTA SUB",
      subtitle: reason,
      description: "Use your fingerprint to continue",
      useFallback: false,
      maxAttempts: MAX_BIOMETRIC_ATTEMPTS,
    });
    // Reset failed attempts on success
    await Preferences.set({ key: FAILED_ATTEMPTS_KEY, value: "0" });
    return { success: true };
  } catch (error: any) {
    // Track failed attempts
    const { value } = await Preferences.get({ key: FAILED_ATTEMPTS_KEY });
    const attempts = parseInt(value || "0", 10) + 1;
    await Preferences.set({ key: FAILED_ATTEMPTS_KEY, value: attempts.toString() });

    if (attempts >= MAX_BIOMETRIC_ATTEMPTS) {
      return {
        success: false,
        error: "Too many failed attempts. Please use your password instead.",
      };
    }

    return {
      success: false,
      error: error?.message || "Biometric authentication failed",
    };
  }
}

/**
 * Check if the user has exceeded max biometric attempts
 */
export async function isBiometricLocked(): Promise<boolean> {
  const { value } = await Preferences.get({ key: FAILED_ATTEMPTS_KEY });
  return parseInt(value || "0", 10) >= MAX_BIOMETRIC_ATTEMPTS;
}

/**
 * Reset biometric failed attempts counter
 */
export async function resetBiometricAttempts(): Promise<void> {
  await Preferences.set({ key: FAILED_ATTEMPTS_KEY, value: "0" });
}

// ─── Login Credentials Storage ───

/**
 * Store user credentials securely for biometric login
 * On native: uses NativeBiometric secure storage (Android Keystore)
 * On web: uses Preferences (fallback, less secure)
 */
export async function storeCredentials(
  email: string,
  password: string
): Promise<void> {
  const deviceId = await getDeviceId();

  if (Capacitor.isNativePlatform()) {
    try {
      const { NativeBiometric } = await import("capacitor-native-biometric");
      await NativeBiometric.setCredentials({
        username: email,
        password,
        server: "com.inkotasub.app",
      });
    } catch {
      // Fallback to preferences
      const creds: StoredCredentials = { email, password, deviceId };
      await Preferences.set({
        key: STORED_CREDENTIALS_KEY,
        value: JSON.stringify(creds),
      });
    }
  } else {
    const creds: StoredCredentials = { email, password, deviceId };
    await Preferences.set({
      key: STORED_CREDENTIALS_KEY,
      value: JSON.stringify(creds),
    });
  }
}

/**
 * Retrieve stored credentials after biometric verification
 */
export async function getStoredCredentials(): Promise<StoredCredentials | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { NativeBiometric } = await import("capacitor-native-biometric");
      const creds = await NativeBiometric.getCredentials({
        server: "com.inkotasub.app",
      });
      const deviceId = await getDeviceId();
      return { email: creds.username, password: creds.password, deviceId };
    } catch {
      // Fallback
    }
  }

  const { value } = await Preferences.get({ key: STORED_CREDENTIALS_KEY });
  if (!value) return null;
  try {
    return JSON.parse(value) as StoredCredentials;
  } catch {
    return null;
  }
}

/**
 * Remove stored credentials
 */
export async function clearStoredCredentials(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { NativeBiometric } = await import("capacitor-native-biometric");
      await NativeBiometric.deleteCredentials({ server: "com.inkotasub.app" });
    } catch {
      // Ignore
    }
  }
  await Preferences.remove({ key: STORED_CREDENTIALS_KEY });
}

// ─── Biometric Preferences ───

export async function isBiometricLoginEnabled(): Promise<boolean> {
  const { value } = await Preferences.get({ key: BIOMETRIC_ENABLED_KEY });
  return value === "true";
}

export async function setBiometricLoginEnabled(enabled: boolean): Promise<void> {
  await Preferences.set({ key: BIOMETRIC_ENABLED_KEY, value: enabled.toString() });
  if (!enabled) {
    await clearStoredCredentials();
    await resetBiometricAttempts();
  }
}

export async function isBiometricTransactionEnabled(): Promise<boolean> {
  const { value } = await Preferences.get({ key: BIOMETRIC_TRANSACTION_KEY });
  return value === "true";
}

export async function setBiometricTransactionEnabled(enabled: boolean): Promise<void> {
  await Preferences.set({ key: BIOMETRIC_TRANSACTION_KEY, value: enabled.toString() });
}

/**
 * Check if credentials exist and biometric login is ready
 */
export async function isBiometricLoginReady(): Promise<boolean> {
  const available = await isBiometricAvailable();
  if (!available) return false;

  const enabled = await isBiometricLoginEnabled();
  if (!enabled) return false;

  const creds = await getStoredCredentials();
  return creds !== null;
}
