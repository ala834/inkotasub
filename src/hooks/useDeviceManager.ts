import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  osVersion: string;
  platform: string;
}

async function getDeviceDetails(): Promise<DeviceInfo> {
  if (Capacitor.isNativePlatform()) {
    const idResult = await Device.getId();
    const infoResult = await Device.getInfo();
    return {
      deviceId: idResult.identifier,
      deviceName: infoResult.name || `${infoResult.manufacturer} ${infoResult.model}`,
      deviceModel: infoResult.model,
      osVersion: infoResult.osVersion,
      platform: infoResult.platform,
    };
  }
  // Web fallback
  const nav = navigator as any;
  const webId = localStorage.getItem("inkota_device_id") || crypto.randomUUID();
  localStorage.setItem("inkota_device_id", webId);
  return {
    deviceId: webId,
    deviceName: nav.userAgentData?.platform || navigator.platform || "Web Browser",
    deviceModel: nav.userAgentData?.brands?.[0]?.brand || "Browser",
    osVersion: nav.userAgentData?.platformVersion || "unknown",
    platform: "web",
  };
}

export function useDeviceManager() {
  const { user, session } = useAuth();

  const registerDevice = useCallback(async (): Promise<{ allowed: boolean; message?: string }> => {
    if (!user || !session) return { allowed: false, message: "Not authenticated" };

    const device = await getDeviceDetails();

    // Check if this device ID is blocked
    const { data: blocked } = await supabase
      .from("trusted_devices")
      .select("id, is_blocked")
      .eq("device_id", device.deviceId)
      .eq("is_blocked", true)
      .maybeSingle();

    if (blocked) {
      return { allowed: false, message: "This device has been blocked by an administrator. Contact support." };
    }

    // Deactivate all other devices for this user (single-device enforcement)
    await supabase
      .from("trusted_devices")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .neq("device_id", device.deviceId);

    // Upsert current device as active
    const { error } = await supabase
      .from("trusted_devices")
      .upsert(
        {
          user_id: user.id,
          device_id: device.deviceId,
          device_name: device.deviceName,
          device_model: device.deviceModel,
          os_version: device.osVersion,
          platform: device.platform,
          is_active: true,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_id" }
      );

    if (error) {
      console.error("Device registration error:", error);
      return { allowed: true }; // Don't block login on registration error
    }

    // Send security notification if this is a new device
    const { data: existingDevices } = await supabase
      .from("trusted_devices")
      .select("id")
      .eq("user_id", user.id);

    if (existingDevices && existingDevices.length > 1) {
      // New device detected - send notification
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "New Device Login",
        message: `Your account was accessed from a new device: ${device.deviceName} (${device.platform}). If this wasn't you, please change your password immediately.`,
        type: "security",
      });
    }

    return { allowed: true };
  }, [user, session]);

  const getMyDevices = useCallback(async () => {
    if (!user) return [];
    const { data } = await supabase
      .from("trusted_devices")
      .select("*")
      .eq("user_id", user.id)
      .order("last_used_at", { ascending: false });
    return data || [];
  }, [user]);

  const removeDevice = useCallback(async (deviceRowId: string) => {
    if (!user) return;
    await supabase
      .from("trusted_devices")
      .delete()
      .eq("id", deviceRowId)
      .eq("user_id", user.id);
  }, [user]);

  const logoutDevice = useCallback(async (deviceRowId: string) => {
    if (!user) return;
    await supabase
      .from("trusted_devices")
      .update({ is_active: false })
      .eq("id", deviceRowId)
      .eq("user_id", user.id);
  }, [user]);

  return { registerDevice, getMyDevices, removeDevice, logoutDevice };
}
