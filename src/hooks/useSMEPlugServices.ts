import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SMEPlugService {
  id: number | string;
  name: string;
  slug: string;
  is_active?: boolean;
  status?: string;
  description?: string;
  category?: string;
  icon?: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  services: SMEPlugService[];
  is_active: boolean;
}

interface SMEPlugServicesResult {
  services: SMEPlugService[];
  categories: ServiceCategory[];
  allServices: SMEPlugService[];
  missingCategories: string[];
  isLoading: boolean;
  error: string | null;
}

export function useSMEPlugServices(): SMEPlugServicesResult {
  const [services, setServices] = useState<SMEPlugService[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [allServices, setAllServices] = useState<SMEPlugService[]>([]);
  const [missingCategories, setMissingCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setIsLoading(true);
        setError(null);

        console.log("Fetching SMEPlug services...");
        const { data, error: fnError } = await supabase.functions.invoke("get-smeplug-services");

        if (fnError) {
          console.error("Failed to fetch SMEPlug services:", fnError);
          setError("Failed to load services");
          return;
        }

        console.log("SMEPlug services response:", data);

        if (data?.success) {
          // Set active services
          if (data.services && Array.isArray(data.services)) {
            setServices(data.services);
          }

          // Set all services (including inactive) for debugging
          if (data.all_services && Array.isArray(data.all_services)) {
            setAllServices(data.all_services);
          }

          // Set categories
          if (data.categories && Array.isArray(data.categories)) {
            setCategories(data.categories);
          }

          // Log missing categories for debugging
          if (data.missing_categories && Array.isArray(data.missing_categories)) {
            setMissingCategories(data.missing_categories);
            console.warn("Missing service categories from SMEPlug:", data.missing_categories);
          }

          // Log API errors if any
          if (data.api_errors && Array.isArray(data.api_errors)) {
            console.warn("SMEPlug API errors:", data.api_errors);
          }
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

  return { services, categories, allServices, missingCategories, isLoading, error };
}
