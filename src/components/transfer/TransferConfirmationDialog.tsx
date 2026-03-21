import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { User, Send } from "lucide-react";

interface TransferConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  recipientName: string;
  recipientIdentifier: string;
  amount: number;
  fee: number;
  total: number;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(value);

const TransferConfirmationDialog = ({
  open,
  onOpenChange,
  onConfirm,
  recipientName,
  recipientIdentifier,
  amount,
  fee,
  total,
}: TransferConfirmationDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Confirm Transfer</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Recipient */}
          <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl">
            <div className="p-2 bg-primary/20 rounded-full">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{recipientName}</p>
              <p className="text-sm text-muted-foreground">{recipientIdentifier}</p>
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transfer Amount</span>
              <span className="font-medium text-foreground">{formatCurrency(amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transfer Fee</span>
              <span className="font-medium text-foreground">{formatCurrency(fee)}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between font-semibold">
              <span className="text-foreground">Total Deduction</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onConfirm} className="flex-1">
            <Send className="h-4 w-4 mr-2" />
            Proceed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TransferConfirmationDialog;
