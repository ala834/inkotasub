import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { readCache, writeCache } from "@/lib/offline-cache";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  ledger_balance: number;
}

export const useWallet = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [wallet, setWallet] = useState<Wallet | null>(() =>
    user ? readCache<Wallet>(user.id, "wallet") : null
  );
  const [isLoading, setIsLoading] = useState(!wallet);

  // Re-hydrate from cache whenever the user changes
  useEffect(() => {
    if (user) {
      const cached = readCache<Wallet>(user.id, "wallet");
      if (cached) {
        setWallet(cached);
        setIsLoading(false);
      }
    } else {
      setWallet(null);
      setIsLoading(false);
    }
  }, [user]);

  const fetchWallet = useCallback(async () => {
    if (!user) {
      setWallet(null);
      setIsLoading(false);
      return;
    }

    // Offline: keep showing cached wallet, do not flip into loading state.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!error && data) {
      const next: Wallet = {
        ...data,
        balance: parseFloat(data.balance as unknown as string),
        ledger_balance: parseFloat(data.ledger_balance as unknown as string),
      };
      setWallet(next);
      writeCache(user.id, "wallet", next);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  // Auto-refetch when the network comes back
  useEffect(() => {
    if (isOnline && user) fetchWallet();
  }, [isOnline, user, fetchWallet]);

  // Subscribe to realtime wallet updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`wallet-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'balance' in payload.new) {
            const newData = payload.new as { id: string; user_id: string; balance: number; ledger_balance: number };
            const next: Wallet = {
              id: newData.id,
              user_id: newData.user_id,
              balance: parseFloat(newData.balance as unknown as string),
              ledger_balance: parseFloat(newData.ledger_balance as unknown as string),
            };
            setWallet(next);
            writeCache(user.id, "wallet", next);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { wallet, isLoading, refetch: fetchWallet };
};
