import { useState, useEffect } from "react";
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

  const fetchWallet = async () => {
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
  };

  useEffect(() => {
    fetchWallet();
  }, [user]);

  return { wallet, isLoading, refetch: fetchWallet };
};
