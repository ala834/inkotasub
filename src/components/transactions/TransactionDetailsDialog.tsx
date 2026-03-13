import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Copy, Check, Eye, EyeOff, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

interface TransactionDetailsDialogProps {
  transaction: {
    id: string;
    type: "credit" | "debit";
    amount: number;
    description: string | null;
    reference: string | null;
    status: "pending" | "success" | "failed";
    balance_before: number;
    balance_after: number;
    created_at: string;
    metadata?: Record<string, any> | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TransactionDetailsDialog = ({
  transaction,
  open,
  onOpenChange,
}: TransactionDetailsDialogProps) => {
  const [copied, setCopied] = useState(false);
  const [copiedPinIdx, setCopiedPinIdx] = useState<number | null>(null);
  const [revealedPins, setRevealedPins] = useState<Set<number>>(new Set());
  if (!transaction) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-success/10 text-success border-success/20";
      case "pending":
        return "bg-warning/10 text-warning border-warning/20";
      case "failed":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const copyReference = () => {
    if (transaction.reference) {
      navigator.clipboard.writeText(transaction.reference);
      setCopied(true);
      toast.success("Reference copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Transaction Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Amount Header */}
          <div className="text-center py-4">
            <div
              className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
                transaction.type === "credit"
                  ? "bg-success/10"
                  : "bg-destructive/10"
              )}
            >
              {transaction.type === "credit" ? (
                <ArrowDownLeft className="h-8 w-8 text-success" />
              ) : (
                <ArrowUpRight className="h-8 w-8 text-destructive" />
              )}
            </div>
            <p
              className={cn(
                "text-3xl font-bold",
                transaction.type === "credit" ? "text-success" : "text-destructive"
              )}
            >
              {transaction.type === "credit" ? "+" : "-"}
              {formatCurrency(transaction.amount)}
            </p>
            <Badge className={cn("mt-2", getStatusColor(transaction.status))}>
              {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
            </Badge>
          </div>

          {/* Details */}
          <div className="space-y-4">
            <div className="flex justify-between items-start py-3 border-b border-border">
              <span className="text-muted-foreground">Description</span>
              <span className="font-medium text-right max-w-[60%]">
                {transaction.description || "N/A"}
              </span>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-border">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium capitalize">{transaction.type}</span>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-border">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">
                {format(new Date(transaction.created_at), "MMM d, yyyy")}
              </span>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-border">
              <span className="text-muted-foreground">Time</span>
              <span className="font-medium">
                {format(new Date(transaction.created_at), "h:mm:ss a")}
              </span>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-border">
              <span className="text-muted-foreground">Balance Before</span>
              <span className="font-medium">{formatCurrency(transaction.balance_before)}</span>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-border">
              <span className="text-muted-foreground">Balance After</span>
              <span className="font-medium">{formatCurrency(transaction.balance_after)}</span>
            </div>

            {transaction.reference && (
              <div className="flex justify-between items-center py-3 border-b border-border">
                <span className="text-muted-foreground">Reference</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm truncate max-w-[150px]">
                    {transaction.reference}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={copyReference}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Exam PIN Display */}
            {transaction.metadata?.pins && Array.isArray(transaction.metadata.pins) && transaction.metadata.pins.length > 0 && (
              <div className="py-3 border-b border-border space-y-3">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    {transaction.metadata.exam_type || "Exam"} Result Checker PIN{transaction.metadata.pins.length > 1 ? "s" : ""}
                  </span>
                </div>
                {transaction.metadata.pins.map((pin: string, idx: number) => (
                  <div key={idx} className="rounded-xl border border-border bg-muted/50 p-3 space-y-1">
                    {transaction.metadata!.pins.length > 1 && (
                      <p className="text-xs text-muted-foreground font-medium">PIN {idx + 1}</p>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <code className="flex-1 text-sm font-mono font-bold text-foreground break-all">
                        {revealedPins.has(idx) ? pin : "••••••••••••"}
                      </code>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setRevealedPins(prev => {
                              const next = new Set(prev);
                              next.has(idx) ? next.delete(idx) : next.add(idx);
                              return next;
                            });
                          }}
                        >
                          {revealedPins.has(idx) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            navigator.clipboard.writeText(pin);
                            setCopiedPinIdx(idx);
                            toast.success("PIN copied!");
                            setTimeout(() => setCopiedPinIdx(null), 2000);
                          }}
                        >
                          {copiedPinIdx === idx ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center py-3">
              <span className="text-muted-foreground">Transaction ID</span>
              <span className="font-mono text-sm truncate max-w-[180px]">
                {transaction.id}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionDetailsDialog;
