import { motion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
}: TransactionConfirmationDialogProps) => {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(value);

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

            <div className="border-t border-border pt-3 mt-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">Amount</span>
                <span className="text-lg font-bold text-primary">
                  {formatCurrency(amount)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Balance after</span>
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
              className="flex-1 h-12 rounded-xl gradient-primary text-primary-foreground font-semibold"
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
