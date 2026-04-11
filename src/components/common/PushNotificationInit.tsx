import { useEffect } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Invisible component that initializes OneSignal push notifications on native platforms.
 * Mount once at the app root level inside AuthProvider.
 */
const PushNotificationInit = () => {
  const { playerId, isNative, isInitialized } = usePushNotifications();

  useEffect(() => {
    if (playerId) {
      console.log("[OneSignal] Device registered, Player ID:", playerId);
    }
  }, [playerId]);

  useEffect(() => {
    if (isInitialized) {
      console.log("[OneSignal] Push notifications initialized on native platform");
    }
  }, [isInitialized]);

  return null;
};

export default PushNotificationInit;
