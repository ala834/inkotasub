import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

// OneSignal App ID — public identifier, safe in client code (like Supabase anon key)
export const ONESIGNAL_APP_ID = "9e89422c-1fd5-42cf-865d-e7371ebd960c";

const DIAG_KEY = "inkota_onesignal_diag";

export type OneSignalDiagnostics = {
  appId: string;
  platform: string;
  isNative: boolean;
  isInitialized: boolean;
  permissionStatus: string;
  optedIn: boolean | null;
  subscriptionId: string | null;
  pushToken: string | null;
  externalId: string | null;
  lastError: string | null;
  lastUpdated: number;
};

const defaultDiag = (): OneSignalDiagnostics => ({
  appId: ONESIGNAL_APP_ID,
  platform: Capacitor.getPlatform(),
  isNative: Capacitor.isNativePlatform(),
  isInitialized: false,
  permissionStatus: "prompt",
  optedIn: null,
  subscriptionId: null,
  pushToken: null,
  externalId: null,
  lastError: null,
  lastUpdated: Date.now(),
});

const persist = (diag: OneSignalDiagnostics) => {
  try {
    localStorage.setItem(DIAG_KEY, JSON.stringify(diag));
  } catch {}
};

export const getStoredOneSignalDiagnostics = (): OneSignalDiagnostics => {
  try {
    const raw = localStorage.getItem(DIAG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return defaultDiag();
};

export const usePushNotifications = () => {
  const [diag, setDiag] = useState<OneSignalDiagnostics>(() => getStoredOneSignalDiagnostics());

  const update = useCallback((patch: Partial<OneSignalDiagnostics>) => {
    setDiag((prev) => {
      const next = { ...prev, ...patch, lastUpdated: Date.now() };
      persist(next);
      return next;
    });
  }, []);

  // Initialize OneSignal on native platforms only
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      update({ isNative: false, lastError: "Push only works on native Android/iOS builds" });
      return;
    }
    if (diag.isInitialized) return;

    let cancelled = false;

    const init = async () => {
      try {
        // Cordova plugin attaches to window.plugins.OneSignal at deviceready;
        // dynamic import is the documented v5 API for Capacitor.
        const mod: any = await import("onesignal-cordova-plugin");
        const OneSignal: any = mod.default ?? mod.OneSignal ?? mod;

        if (!OneSignal || typeof OneSignal.initialize !== "function") {
          throw new Error("OneSignal plugin not available — is the native build synced (npx cap sync)?");
        }

        // Verbose logs help diagnose registration in adb logcat
        try { OneSignal.Debug?.setLogLevel?.(6); } catch {}
        try { OneSignal.Debug?.setAlertLevel?.(0); } catch {}

        OneSignal.initialize(ONESIGNAL_APP_ID);
        console.log("[OneSignal] initialize() called with", ONESIGNAL_APP_ID);

        // Bind to current Supabase user as external_id so we can target per-user pushes
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            OneSignal.login(user.id);
            update({ externalId: user.id });
            console.log("[OneSignal] login() ->", user.id);
          }
        } catch (e) {
          console.warn("[OneSignal] could not bind external_id:", e);
        }

        // Subscription listener — fires when token/id becomes available
        const readSubscription = () => {
          try {
            const sub = OneSignal.User?.pushSubscription;
            const id = sub?.id ?? sub?.getIdAsync?.() ?? null;
            const token = sub?.token ?? null;
            const optedIn = typeof sub?.optedIn === "boolean" ? sub.optedIn : null;
            if (id || token || optedIn !== null) {
              update({
                subscriptionId: typeof id === "string" ? id : null,
                pushToken: typeof token === "string" ? token : null,
                optedIn,
              });
              if (id) console.log("[OneSignal] Player/Subscription ID:", id);
              if (token) console.log("[OneSignal] Push Token:", String(token).substring(0, 24) + "…");
            }
          } catch (e) {
            console.warn("[OneSignal] readSubscription error:", e);
          }
        };

        try {
          OneSignal.User?.pushSubscription?.addEventListener?.("change", (event: any) => {
            console.log("[OneSignal] subscription change:", event);
            const cur = event?.current ?? {};
            update({
              subscriptionId: cur.id ?? null,
              pushToken: cur.token ?? null,
              optedIn: typeof cur.optedIn === "boolean" ? cur.optedIn : null,
            });
          });
        } catch (e) {
          console.warn("[OneSignal] could not attach subscription listener:", e);
        }

        // Notification handlers
        try {
          OneSignal.Notifications?.addEventListener?.("foregroundWillDisplay", (event: any) => {
            console.log("[OneSignal] foreground notification:", event?.notification);
            event?.getNotification?.()?.display?.();
          });
          OneSignal.Notifications?.addEventListener?.("click", (event: any) => {
            console.log("[OneSignal] notification clicked:", event);
            const route = event?.notification?.additionalData?.route;
            if (route) window.location.href = route;
          });
          OneSignal.Notifications?.addEventListener?.("permissionChange", (granted: boolean) => {
            console.log("[OneSignal] permissionChange:", granted);
            update({ permissionStatus: granted ? "granted" : "denied" });
          });
        } catch (e) {
          console.warn("[OneSignal] could not attach notification listeners:", e);
        }

        // Request permission AFTER init so the prompt is owned by OneSignal
        try {
          const accepted = await OneSignal.Notifications.requestPermission(true);
          if (cancelled) return;
          update({ permissionStatus: accepted ? "granted" : "denied" });
          console.log("[OneSignal] permission accepted:", accepted);
          // Make sure the user is opted in (some Android flows leave it false)
          try { OneSignal.User?.pushSubscription?.optIn?.(); } catch {}
        } catch (e) {
          console.warn("[OneSignal] requestPermission error:", e);
        }

        // Initial read + delayed retries — subscription id can take a few seconds
        readSubscription();
        const retries = [1000, 3000, 6000, 10000];
        retries.forEach((ms) =>
          setTimeout(() => {
            if (!cancelled) readSubscription();
          }, ms)
        );

        update({ isInitialized: true, lastError: null });
        console.log("[OneSignal] initialization complete");
      } catch (error: any) {
        const msg = error?.message ?? String(error);
        console.error("[OneSignal] init error:", msg);
        update({ lastError: msg });
      }
    };

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...diag,
    playerId: diag.subscriptionId, // back-compat alias
  };
};
