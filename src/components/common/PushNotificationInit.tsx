import { useEffect } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Invisible component that initializes Firebase Cloud Messaging (FCM) push
 * notifications on native platforms. Mount once at the app root inside AuthProvider.
 */
const PushNotificationInit = () => {
  const { fcmToken, isNative, isInitialized } = usePushNotifications();

  useEffect(() => {
    if (fcmToken) {
      console.log("[FCM] Device registered, token:", fcmToken.substring(0, 24) + "…");
    }
  }, [fcmToken]);

  useEffect(() => {
    if (isInitialized && isNative) {
      console.log("[FCM] Push notifications initialized on native platform");
    }
  }, [isInitialized, isNative]);

  return null;
};

export default PushNotificationInit;
