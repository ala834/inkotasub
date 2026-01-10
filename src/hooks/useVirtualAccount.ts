import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface VirtualAccount {
  id: string;
  user_id: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  bank_code: string | null;
  provider: string;
  is_active: boolean;
  created_at: string;
}

export const useVirtualAccount = () => {
  const { user } = useAuth();
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVirtualAccount = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("virtual_accounts")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      setVirtualAccount(data);
    } catch (err) {
      console.error("Error fetching virtual account:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch account");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const createVirtualAccount = async () => {
    if (!user) return null;

    setIsCreating(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "create-virtual-account"
      );

      if (invokeError) throw invokeError;

      if (data?.account) {
        setVirtualAccount(data.account);
        return data.account;
      }

      throw new Error(data?.error || "Failed to create virtual account");
    } catch (err) {
      console.error("Error creating virtual account:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to create account";
      setError(errorMessage);
      throw err;
    } finally {
      setIsCreating(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchVirtualAccount();
  }, [fetchVirtualAccount]);

  // Real-time subscription for updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("virtual-account-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "virtual_accounts",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            setVirtualAccount(payload.new as VirtualAccount);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return {
    virtualAccount,
    isLoading,
    isCreating,
    error,
    createVirtualAccount,
    refetch: fetchVirtualAccount,
  };
};

export default useVirtualAccount;
