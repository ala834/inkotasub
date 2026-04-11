import { useEffect } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Invisible component that initializes FCM push notifications on native platforms.
 * Mount once at the app root level inside AuthProvider.
 */
const PushNotificationInit = () => {
  const { fcmToken, isNative } = usePushNotifications();

  useEffect(() => {
    if (fcmToken) {
      console.log("[FCM] Token registered:", fcmToken.substring(0, 20) + "...");
    }
  }, [fcmToken]);

  // This component renders nothing
  return null;
};

export default PushNotificationInit;
