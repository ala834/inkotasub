import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SMEPlugService {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  description?: string;
}

export function useSMEPlugServices() {
  const [services, setServices] = useState<SMEPlugService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const { data, error: fnError } = await supabase.functions.invoke("get-smeplug-services");

        if (fnError) {
          console.error("Failed to fetch SMEPlug services:", fnError);
          setError("Failed to load services");
          return;
        }

        if (data?.success && data?.services) {
          setServices(data.services);
        } else if (data?.error) {
          setError(data.error);
        } else {
          setError("No services available from provider");
        }
      } catch (err) {
        console.error("Error fetching SMEPlug services:", err);
        setError("Failed to load services");
      } finally {
        setIsLoading(false);
      }
    };

    fetchServices();
  }, []);

  return { services, isLoading, error };
}
