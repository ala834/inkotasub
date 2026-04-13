import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Beneficiary {
  id: string;
  service_type: string;
  identifier: string;
  label: string | null;
  network: string | null;
  created_at: string;
}

export function useBeneficiaries(serviceType: string) {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBeneficiaries = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("beneficiaries")
        .select("*")
        .eq("user_id", user.id)
        .eq("service_type", serviceType)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setBeneficiaries((data as Beneficiary[]) || []);
    } catch {
      // Silently fail - beneficiaries are a convenience feature
    } finally {
      setLoading(false);
    }
  }, [serviceType]);

  useEffect(() => {
    fetchBeneficiaries();
  }, [fetchBeneficiaries]);

  const addBeneficiary = useCallback(
    async (identifier: string, label?: string, network?: string) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
          .from("beneficiaries")
          .upsert(
            {
              user_id: user.id,
              service_type: serviceType,
              identifier: identifier.trim(),
              label: label || null,
              network: network || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,service_type,identifier" }
          );

        if (error) throw error;
        await fetchBeneficiaries();
      } catch {
        // Silent fail
      }
    },
    [serviceType, fetchBeneficiaries]
  );

  const removeBeneficiary = useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from("beneficiaries")
          .delete()
          .eq("id", id);

        if (error) throw error;
        setBeneficiaries((prev) => prev.filter((b) => b.id !== id));
        toast.success("Beneficiary removed");
      } catch {
        toast.error("Failed to remove beneficiary");
      }
    },
    []
  );

  return { beneficiaries, loading, addBeneficiary, removeBeneficiary, refresh: fetchBeneficiaries };
}
