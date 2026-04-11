import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const usePushNotifications = () => {
  const { user } = useAuth();
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>("prompt");
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  const saveTokenToServer = useCallback(
    async (token: string) => {
      if (!user) return;

      try {
        // Upsert the push subscription token
        const { error } = await supabase.from("push_subscriptions").upsert(
          {
            user_id: user.id,
            endpoint: token,
            p256dh: "fcm",
            auth: "fcm",
          },
          { onConflict: "user_id,endpoint" }
        );

        if (error) {
          console.error("Failed to save FCM token:", error);
        } else {
          console.log("FCM token saved to server");
        }
      } catch (err) {
        console.error("Error saving FCM token:", err);
      }
    },
    [user]
  );

  const registerPushNotifications = useCallback(async () => {
    if (!isNative) {
      console.log("Push notifications only available on native platforms");
      return false;
    }

    try {
      // Check current permission status
      const permResult = await PushNotifications.checkPermissions();
      setPermissionStatus(permResult.receive);

      if (permResult.receive === "prompt" || permResult.receive === "prompt-with-rationale") {
        const requestResult = await PushNotifications.requestPermissions();
        setPermissionStatus(requestResult.receive);

        if (requestResult.receive !== "granted") {
          toast.error("Push notification permission denied");
          return false;
        }
      } else if (permResult.receive !== "granted") {
        toast.error("Push notifications are blocked. Enable them in device settings.");
        return false;
      }

      // Register with FCM
      await PushNotifications.register();
      return true;
    } catch (error) {
      console.error("Error registering push notifications:", error);
      toast.error("Failed to set up push notifications");
      return false;
    }
  }, [isNative]);

  useEffect(() => {
    if (!isNative || !user) return;

    // Listen for successful registration (FCM token received)
    const registrationListener = PushNotifications.addListener(
      "registration",
      (token) => {
        console.log("FCM Token:", token.value);
        setFcmToken(token.value);
        saveTokenToServer(token.value);
      }
    );

    // Listen for registration errors
    const errorListener = PushNotifications.addListener(
      "registrationError",
      (error) => {
        console.error("Push registration error:", error);
        toast.error("Failed to register for push notifications");
      }
    );

    // Listen for notifications received while app is in foreground
    const foregroundListener = PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        console.log("Foreground notification:", notification);
        toast(notification.title || "New Notification", {
          description: notification.body || "",
        });
      }
    );

    // Listen for notification taps (when user taps a notification)
    const actionListener = PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        console.log("Notification action:", action);
        // Navigate or handle based on action.notification.data
        const data = action.notification.data;
        if (data?.route) {
          window.location.href = data.route;
        }
      }
    );

    // Auto-register on mount
    registerPushNotifications();

    return () => {
      registrationListener.then((l) => l.remove());
      errorListener.then((l) => l.remove());
      foregroundListener.then((l) => l.remove());
      actionListener.then((l) => l.remove());
    };
  }, [isNative, user, registerPushNotifications, saveTokenToServer]);

  return {
    fcmToken,
    permissionStatus,
    isNative,
    registerPushNotifications,
  };
};
