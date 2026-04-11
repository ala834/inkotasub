import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

// OneSignal App ID - stored as a constant since it's a public identifier (like Supabase anon key)
const ONESIGNAL_APP_ID = "YOUR_ONESIGNAL_APP_ID"; // Will be replaced with actual ID

export const usePushNotifications = () => {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>("prompt");
  const [isNative, setIsNative] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  useEffect(() => {
    if (!isNative || isInitialized) return;

    const initOneSignal = async () => {
      try {
        // Dynamic import for native-only plugin
        const OneSignalPlugin = await import("onesignal-cordova-plugin");
        const OneSignal = OneSignalPlugin.default;

        // Set log level for debugging (remove in production)
        OneSignal.Debug.setLogLevel(6); // VERBOSE

        // Initialize with App ID
        OneSignal.initialize(ONESIGNAL_APP_ID);

        // Request notification permission
        const accepted = await OneSignal.Notifications.requestPermission(true);
        setPermissionStatus(accepted ? "granted" : "denied");
        console.log("[OneSignal] Permission accepted:", accepted);

        // Listen for notification received in foreground
        OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: any) => {
          console.log("[OneSignal] Foreground notification:", event.notification);
          // Let OneSignal display the notification
          event.getNotification().display();
        });

        // Listen for notification clicks
        OneSignal.Notifications.addEventListener("click", (event: any) => {
          console.log("[OneSignal] Notification clicked:", event);
          const data = event.notification?.additionalData;
          if (data?.route) {
            window.location.href = data.route;
          }
        });

        // Get the OneSignal Player/Subscription ID
        const subscriptionId = OneSignal.User.pushSubscription.getPushSubscriptionId();
        const token = OneSignal.User.pushSubscription.getPushSubscriptionToken();
        
        if (subscriptionId) {
          setPlayerId(subscriptionId);
          console.log("[OneSignal] Player ID:", subscriptionId);
        }
        if (token) {
          console.log("[OneSignal] Push Token:", token.substring(0, 20) + "...");
        }

        // Listen for subscription changes
        OneSignal.User.pushSubscription.addEventListener("change", (event: any) => {
          console.log("[OneSignal] Subscription changed:", event);
          if (event.current?.id) {
            setPlayerId(event.current.id);
            console.log("[OneSignal] Updated Player ID:", event.current.id);
          }
        });

        setIsInitialized(true);
        console.log("[OneSignal] Initialized successfully");
      } catch (error) {
        console.error("[OneSignal] Initialization error:", error);
      }
    };

    initOneSignal();
  }, [isNative, isInitialized]);

  return {
    playerId,
    permissionStatus,
    isNative,
    isInitialized,
  };
};
