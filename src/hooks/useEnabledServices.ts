import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface EnabledServices {
  data: boolean;
  airtime: boolean;
  electricity: boolean;
  cable: boolean;
  exam_pin: boolean;
}

export const useEnabledServices = () => {
  const [enabledServices, setEnabledServices] = useState<EnabledServices>({
    data: true,
    airtime: true,
    electricity: true,
    cable: true,
    exam_pin: false, // Disabled by default as SUBPADI doesn't support it
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchEnabledServices();
  }, []);

  const fetchEnabledServices = async () => {
    try {
      // Fetch app settings for service availability
      const { data: settings } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", [
          "service_data_enabled",
          "service_airtime_enabled",
          "service_electricity_enabled",
          "service_cable_enabled",
          "service_exam_pin_enabled",
        ]);

      if (settings) {
        const serviceMap: EnabledServices = {
          data: true,
          airtime: true,
          electricity: true,
          cable: true,
          exam_pin: false,
        };

        settings.forEach((setting) => {
          const key = setting.key.replace("service_", "").replace("_enabled", "");
          if (key in serviceMap) {
            serviceMap[key as keyof EnabledServices] = setting.value === "true";
          }
        });

        setEnabledServices(serviceMap);
      }

      // Also check if there are any enabled plans for each service
      const { data: plansData } = await supabase
        .from("service_plans")
        .select("service_type, is_enabled")
        .eq("is_enabled", true);

      if (plansData) {
        const hasEnabledPlans: Record<string, boolean> = {};
        plansData.forEach((plan) => {
          hasEnabledPlans[plan.service_type] = true;
        });

        // If there are no enabled plans for a service, consider it disabled
        setEnabledServices((prev) => ({
          ...prev,
          data: prev.data && (hasEnabledPlans.data ?? true),
          airtime: prev.airtime, // Airtime doesn't use plans table
          electricity: prev.electricity, // Uses provider list
          cable: prev.cable, // Uses provider list
          exam_pin: false, // Always disabled - not supported by SUBPADI
        }));
      }
    } catch (error) {
      console.error("Error fetching enabled services:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return { enabledServices, isLoading, refetch: fetchEnabledServices };
};
