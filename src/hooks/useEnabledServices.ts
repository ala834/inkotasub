import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/contexts/AppSettingsContext";

interface EnabledServices {
  data: boolean;
  airtime: boolean;
  electricity: boolean;
  cable: boolean;
  exam_pin: boolean;
}

export const useEnabledServices = () => {
  const { settings, isLoading: settingsLoading, version } = useAppSettings();
  const [enabledServices, setEnabledServices] = useState<EnabledServices>({
    data: true,
    airtime: true,
    electricity: true,
    cable: true,
    exam_pin: true,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Derive from global settings
    const serviceMap: EnabledServices = {
      data: settings.service_data_enabled !== "false",
      airtime: settings.service_airtime_enabled !== "false",
      electricity: settings.service_electricity_enabled !== "false",
      cable: settings.service_cable_enabled !== "false",
      exam_pin: settings.service_exam_pin_enabled !== "false",
    };

    // Also check plans availability
    const checkPlans = async () => {
      const { data: plansData } = await supabase
        .from("service_plans")
        .select("service_type")
        .eq("is_enabled", true);

      if (plansData) {
        const hasPlans: Record<string, boolean> = {};
        plansData.forEach((p) => { hasPlans[p.service_type] = true; });
        serviceMap.data = serviceMap.data && (hasPlans.data ?? true);
      }

      setEnabledServices(serviceMap);
      setIsLoading(false);
    };

    if (!settingsLoading) {
      checkPlans();
    }
  }, [settings, settingsLoading, version]);

  return { enabledServices, isLoading, refetch: () => {} };
};
