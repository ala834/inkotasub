import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import {
  isBiometricAvailable,
  isBiometricLoginEnabled,
  setBiometricLoginEnabled,
  isBiometricTransactionEnabled,
  setBiometricTransactionEnabled,
  isBiometricLoginReady,
  authenticateWithBiometric,
  storeCredentials,
  clearStoredCredentials,
  getStoredCredentials,
  getDeviceId,
  getDeviceInfo,
  isBiometricLocked,
  resetBiometricAttempts,
} from "@/lib/biometric";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useBiometric() {
  const { user } = useAuth();
  const [available, setAvailable] = useState(false);
  const [loginEnabled, setLoginEnabled] = useState(false);
  const [transactionEnabled, setTransactionEnabled] = useState(false);
  const [loginReady, setLoginReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  const refresh = useCallback(async () => {
    const avail = await isBiometricAvailable();
    setAvailable(avail);
    if (avail) {
      const [le, te, lr, lk] = await Promise.all([
        isBiometricLoginEnabled(),
        isBiometricTransactionEnabled(),
        isBiometricLoginReady(),
        isBiometricLocked(),
      ]);
      setLoginEnabled(le);
      setTransactionEnabled(te);
      setLoginReady(lr);
      setLocked(lk);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enableBiometricLogin = useCallback(
    async (email: string, password: string) => {
      // First verify biometric
      const result = await authenticateWithBiometric("Enable fingerprint login");
      if (!result.success) return result;

      // Store credentials securely
      await storeCredentials(email, password);
      await setBiometricLoginEnabled(true);

      // Register device in database
      if (user) {
        const deviceId = await getDeviceId();
        const deviceInfo = await getDeviceInfo();
        await supabase.from("trusted_devices").upsert(
          {
            user_id: user.id,
            device_id: deviceId,
            device_name: deviceInfo.name,
            platform: deviceInfo.platform,
            biometric_enabled: true,
          },
          { onConflict: "user_id,device_id" }
        );
      }

      await refresh();
      return { success: true };
    },
    [user, refresh]
  );

  const disableBiometricLogin = useCallback(async () => {
    await setBiometricLoginEnabled(false);
    await clearStoredCredentials();

    if (user) {
      const deviceId = await getDeviceId();
      await supabase
        .from("trusted_devices")
        .update({ biometric_enabled: false })
        .eq("user_id", user.id)
        .eq("device_id", deviceId);
    }

    await refresh();
  }, [user, refresh]);

  const toggleTransactionBiometric = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const result = await authenticateWithBiometric("Enable fingerprint for transactions");
        if (!result.success) return result;
      }
      await setBiometricTransactionEnabled(enabled);
      await refresh();
      return { success: true };
    },
    [refresh]
  );

  const biometricLogin = useCallback(async (): Promise<{ success: boolean; error?: string; email?: string; password?: string }> => {
    if (locked) {
      return { success: false, error: "Too many failed attempts. Use password." };
    }

    const result = await authenticateWithBiometric("Login with fingerprint");
    if (!result.success) {
      await refresh();
      return result;
    }

    const creds = await getStoredCredentials();
    if (!creds?.email || !creds?.password) {
      return { success: false, error: "No stored credentials. Please login with password first." };
    }

    const deviceId = await getDeviceId();
    if (creds.deviceId !== deviceId) {
      return { success: false, error: "This device is not registered. Please login with password." };
    }

    return { success: true, email: creds.email, password: creds.password };
  }, [locked, refresh]);

  const biometricVerifyTransaction = useCallback(async () => {
    const te = await isBiometricTransactionEnabled();
    if (!te) return { success: false, error: "Biometric not enabled for transactions" };

    return authenticateWithBiometric("Verify transaction");
  }, []);

  const resetLock = useCallback(async () => {
    await resetBiometricAttempts();
    await refresh();
  }, [refresh]);

  return {
    available,
    isNative,
    loginEnabled,
    transactionEnabled,
    loginReady,
    locked,
    enableBiometricLogin,
    disableBiometricLogin,
    toggleTransactionBiometric,
    biometricLogin,
    biometricVerifyTransaction,
    resetLock,
    refresh,
  };
}
