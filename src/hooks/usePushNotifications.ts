import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

/**
 * Firebase Cloud Messaging (FCM) push notifications via @capacitor/push-notifications.
 * Web builds are a no-op — push tokens only register inside the installed Android/iOS app.
 */

const DIAG_KEY = "inkota_fcm_diag";

export type PushDiagnostics = {
  platform: string;
  isNative: boolean;
  isInitialized: boolean;
  permissionStatus: "prompt" | "granted" | "denied";
  fcmToken: string | null;
  userId: string | null;
  lastError: string | null;
  lastUpdated: number;
};

const defaultDiag = (): PushDiagnostics => ({
  platform: Capacitor.getPlatform(),
  isNative: Capacitor.isNativePlatform(),
  isInitialized: false,
  permissionStatus: "prompt",
  fcmToken: null,
  userId: null,
  lastError: null,
  lastUpdated: Date.now(),
});

const persist = (diag: PushDiagnostics) => {
  try {
    localStorage.setItem(DIAG_KEY, JSON.stringify(diag));
  } catch {}
};

export const getStoredPushDiagnostics = (): PushDiagnostics => {
  try {
    const raw = localStorage.getItem(DIAG_KEY);
    if (raw) return { ...defaultDiag(), ...JSON.parse(raw) };
  } catch {}
  return defaultDiag();
};

export const usePushNotifications = () => {
  const [diag, setDiag] = useState<PushDiagnostics>(() => getStoredPushDiagnostics());

  const update = useCallback((patch: Partial<PushDiagnostics>) => {
    setDiag((prev) => {
      const next = { ...prev, ...patch, lastUpdated: Date.now() };
      persist(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      update({ isNative: false, lastError: "Push only works on native Android/iOS builds" });
      return;
    }
    if (diag.isInitialized) return;

    let cancelled = false;

    const init = async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        // Register listeners BEFORE requesting permission
        await PushNotifications.addListener("registration", async (token) => {
          if (cancelled) return;
          console.log("[FCM] token:", token.value.substring(0, 24) + "…");
          update({ fcmToken: token.value, lastError: null });

          // Persist token against the current user so backend can target pushes
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id) {
              update({ userId: user.id });
              await supabase.from("user_push_tokens").upsert(
                {
                  user_id: user.id,
                  token: token.value,
                  platform: Capacitor.getPlatform(),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "token" }
              );
            }
          } catch (e) {
            console.warn("[FCM] token persist skipped:", e);
          }
        });

        await PushNotifications.addListener("registrationError", (err) => {
          console.error("[FCM] registration error:", err);
          update({ lastError: err?.error ?? String(err) });
        });

        await PushNotifications.addListener("pushNotificationReceived", (n) => {
          console.log("[FCM] foreground notification:", n);
        });

        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          console.log("[FCM] notification action:", action);
          const route = (action?.notification?.data as any)?.route;
          if (route) window.location.href = route;
        });

        // Ask permission (Android 13+ POST_NOTIFICATIONS handled by plugin)
        let permission = await PushNotifications.checkPermissions();
        if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
          permission = await PushNotifications.requestPermissions();
        }

        if (permission.receive !== "granted") {
          update({ permissionStatus: "denied", isInitialized: true });
          return;
        }

        update({ permissionStatus: "granted" });
        await PushNotifications.register();
        update({ isInitialized: true, lastError: null });
        console.log("[FCM] initialization complete");
      } catch (error: any) {
        const msg = error?.message ?? String(error);
        console.error("[FCM] init error:", msg);
        update({ lastError: msg });
      }
    };

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return diag;
};
