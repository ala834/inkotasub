import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AppSettings {
  [key: string]: string | null;
}

interface AppSettingsContextType {
  settings: AppSettings;
  isLoading: boolean;
  version: number;
  refetch: () => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextType>({
  settings: {},
  isLoading: true,
  version: 0,
  refetch: async () => {},
});

export const useAppSettings = () => useContext(AppSettingsContext);

export const AppSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<AppSettings>({});
  const [version, setVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const realtimeActive = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value, version");

      if (error) throw error;

      if (data) {
        const map: AppSettings = {};
        let maxVersion = 0;
        data.forEach((row: any) => {
          map[row.key] = row.value;
          if (row.version > maxVersion) maxVersion = row.version;
        });
        setSettings(map);
        setVersion(maxVersion);
      }
    } catch (err) {
      console.error("Failed to fetch app settings:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("app-settings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        (payload) => {
          realtimeActive.current = true;
          const row = payload.new as any;
          if (row) {
            setSettings((prev) => ({ ...prev, [row.key]: row.value }));
            if (row.version > version) {
              setVersion(row.version);
              toast.info("App settings updated", { duration: 3000 });
            }
          }
        }
      )
      .subscribe((status) => {
        realtimeActive.current = status === "SUBSCRIBED";
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [version]);

  // Polling fallback — every 60s if realtime isn't active
  useEffect(() => {
    pollRef.current = setInterval(() => {
      if (!realtimeActive.current) {
        fetchSettings();
      }
    }, 60000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchSettings]);

  return (
    <AppSettingsContext.Provider value={{ settings, isLoading, version, refetch: fetchSettings }}>
      {children}
    </AppSettingsContext.Provider>
  );
};
