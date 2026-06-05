import { motion } from "framer-motion";
import { AlertTriangle, Gift, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export interface TransactionDetail {
  label: string;
  value: string;
}

interface TransactionConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  details: TransactionDetail[];
  amount: number;
  walletBalanceAfter: number;
  isLoading?: boolean;
  cashbackToEarn?: number;
  cashbackBalance?: number;
  useCashback?: boolean;
  onToggleUseCashback?: (v: boolean) => void;
}

const TransactionConfirmationDialog = ({
  open,
  onOpenChange,
  onConfirm,
  title = "Confirm Transaction",
  details,
  amount,
  walletBalanceAfter,
  isLoading = false,
  cashbackToEarn = 0,
  cashbackBalance = 0,
  useCashback = false,
  onToggleUseCashback,
}: TransactionConfirmationDialogProps) => {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(value);

  const cashbackUseAmount = Math.min(cashbackBalance, amount);
  const showCashbackToggle = onToggleUseCashback && cashbackBalance > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <DialogTitle className="text-xl font-display">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Review your transaction details before proceeding
          </DialogDescription>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Bonus to earn */}
          {cashbackToEarn > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-900/60">
              <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-sm">
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                  Bonus to Earn: ₦{cashbackToEarn.toLocaleString(undefined, { minimumFractionDigits: 2 })} Cashback
                </div>
                <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                  Credited to your cashback wallet after success
                </div>
              </div>
            </div>
          )}

          {/* Use cashback toggle */}
          {showCashbackToggle && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                  <Gift className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-medium">Use Cashback</div>
                  <div className="text-xs text-muted-foreground">
                    Available ₦{cashbackBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <Switch checked={useCashback} onCheckedChange={onToggleUseCashback} />
            </div>
          )}

          {/* Transaction Details */}
          <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
            {details.map((detail, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{detail.label}</span>
                <span className="font-medium text-right max-w-[60%] break-all">
                  {detail.value}
                </span>
              </div>
            ))}

            {useCashback && cashbackUseAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cashback applied</span>
                <span className="font-medium text-emerald-600">
                  -{formatCurrency(cashbackUseAmount)}
                </span>
              </div>
            )}

            <div className="border-t border-border pt-3 mt-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">Amount</span>
                <span className="text-lg font-bold text-primary">
                  {formatCurrency(amount)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Wallet balance after</span>
                <span className={`font-semibold ${walletBalanceAfter < 0 ? "text-destructive" : "text-foreground"}`}>
                  {formatCurrency(walletBalanceAfter)}
                </span>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive leading-relaxed">
              Please confirm the details carefully. Transactions cannot be reversed after payment.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="flex-1 h-12 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 h-12 rounded-xl green-primary text-primary-foreground font-semibold"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Confirm & Pay"
              )}
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionConfirmationDialog;
