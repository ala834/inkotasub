import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CashbackWallet {
  balance: number;
  total_earned: number;
  total_spent: number;
}

export interface CashbackSetting {
  service_type: string;
  percentage: number;
  is_enabled: boolean;
  max_cashback: number | null;
}

export function useCashbackWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<CashbackWallet | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWallet = useCallback(async () => {
    if (!user) {
      setWallet(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("cashback_wallets")
      .select("balance, total_earned, total_spent")
      .eq("user_id", user.id)
      .maybeSingle();
    setWallet(
      data
        ? {
            balance: Number(data.balance),
            total_earned: Number(data.total_earned),
            total_spent: Number(data.total_spent),
          }
        : { balance: 0, total_earned: 0, total_spent: 0 },
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`cashback-wallet-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cashback_wallets", filter: `user_id=eq.${user.id}` },
        () => fetchWallet(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, fetchWallet]);

  return { wallet, loading, refetch: fetchWallet };
}

export function useCashbackSetting(serviceType: string | null) {
  const [setting, setSetting] = useState<CashbackSetting | null>(null);

  useEffect(() => {
    if (!serviceType) return;
    (async () => {
      const { data } = await supabase
        .from("cashback_settings")
        .select("service_type, percentage, is_enabled, max_cashback")
        .eq("service_type", serviceType)
        .maybeSingle();
      if (data) {
        setSetting({
          service_type: data.service_type,
          percentage: Number(data.percentage),
          is_enabled: data.is_enabled,
          max_cashback: data.max_cashback ? Number(data.max_cashback) : null,
        });
      }
    })();
  }, [serviceType]);

  return setting;
}

export function calcCashback(amount: number, setting: CashbackSetting | null): number {
  if (!setting || !setting.is_enabled || setting.percentage <= 0 || amount <= 0) return 0;
  let cb = Math.round((amount * setting.percentage) / 100 * 100) / 100;
  if (setting.max_cashback != null && cb > setting.max_cashback) cb = setting.max_cashback;
  return cb;
}
