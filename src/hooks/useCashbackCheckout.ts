import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCashbackSetting, useCashbackWallet, calcCashback } from "@/hooks/useCashback";

/**
 * Helper for transaction pages: exposes cashback bonus preview, Use Cashback
 * toggle state, and a `redeemIfNeeded()` to call right before debiting wallet.
 */
export function useCashbackCheckout(serviceType: string, amount: number) {
  const setting = useCashbackSetting(serviceType);
  const { wallet, refetch } = useCashbackWallet();
  const [useCashback, setUseCashback] = useState(false);

  const cashbackToEarn = calcCashback(amount, setting);
  const cashbackBalance = wallet?.balance || 0;

  /**
   * If the user opted to use cashback, transfer min(balance, amount)
   * from cashback wallet to main wallet so the regular debit flow works.
   * Returns true on success, false if it failed (and toasts an error).
   */
  const redeemIfNeeded = async (): Promise<boolean> => {
    if (!useCashback) return true;
    const redeem = Math.min(cashbackBalance, amount);
    if (redeem <= 0) return true;
    const { data, error } = await supabase.functions.invoke("redeem-cashback", {
      body: { amount: redeem },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || "Failed to apply cashback");
      return false;
    }
    await refetch();
    return true;
  };

  return {
    cashbackToEarn,
    cashbackBalance,
    useCashback,
    setUseCashback,
    redeemIfNeeded,
  };
}
