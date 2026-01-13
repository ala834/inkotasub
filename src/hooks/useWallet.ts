import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  ledger_balance: number;
}

export const useWallet = () => {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWallet = useCallback(async () => {
    if (!user) {
      setWallet(null);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!error && data) {
      setWallet({
        ...data,
        balance: parseFloat(data.balance as unknown as string),
        ledger_balance: parseFloat(data.ledger_balance as unknown as string),
      });
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

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
            setWallet({
              id: newData.id,
              user_id: newData.user_id,
              balance: parseFloat(newData.balance as unknown as string),
              ledger_balance: parseFloat(newData.ledger_balance as unknown as string),
            });
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
