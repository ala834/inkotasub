import { motion } from "framer-motion";
import { Wallet, Smartphone, Wifi, Tv, Zap, ChevronRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useTransactions, Transaction } from "@/hooks/useTransactions";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";

const TransactionsList = () => {
  const navigate = useNavigate();
  const { transactions, isLoading } = useTransactions({ limit: 5 });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) {
      return `Today, ${format(date, "h:mm a")}`;
    }
    if (isYesterday(date)) {
      return `Yesterday, ${format(date, "h:mm a")}`;
    }
    return format(date, "MMM d, yyyy");
  };

  const getTransactionIcon = (description: string | null) => {
    const desc = (description || "").toLowerCase();
    if (desc.includes("data")) return Wifi;
    if (desc.includes("airtime")) return Smartphone;
    if (desc.includes("cable") || desc.includes("dstv") || desc.includes("gotv") || desc.includes("startimes")) return Tv;
    if (desc.includes("electricity") || desc.includes("disco")) return Zap;
    if (desc.includes("transfer")) return Send;
    return Wallet;
  };

  const getTransactionTitle = (tx: Transaction) => {
    if (tx.description) {
      // Extract meaningful title from description
      const desc = tx.description.toLowerCase();
      if (desc.includes("wallet funded") || desc.includes("funding") || desc.includes("credit")) {
        return tx.type === "credit" ? "Wallet Funded" : tx.description;
      }
      if (desc.includes("data")) return "Data Purchase";
      if (desc.includes("airtime")) return "Airtime Purchase";
      if (desc.includes("electricity")) return "Electricity Payment";
      if (desc.includes("cable") || desc.includes("tv")) return "Cable TV Subscription";
      if (desc.includes("transfer")) return tx.type === "debit" ? "Transfer Sent" : "Transfer Received";
    }
    return tx.type === "credit" ? "Wallet Credit" : "Wallet Debit";
  };

  const statusColors = {
    success: "text-success",
    pending: "text-warning",
    failed: "text-destructive",
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card rounded-3xl p-5 shadow-sm border border-border/50"
      >
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="w-12 h-12 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20 ml-auto" />
                <Skeleton className="h-3 w-16 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-card rounded-3xl p-5 shadow-sm border border-border/50"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground">
          Recent Transactions
        </h3>
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-primary hover:text-primary/80"
          onClick={() => navigate("/history")}
        >
          See All
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {transactions.length === 0 ? (
        <div className="py-8 text-center">
          <Wallet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground font-medium">No transactions yet</p>
          <p className="text-sm text-muted-foreground/70">Your transactions will appear here</p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {transactions.map((tx, index) => {
            const Icon = getTransactionIcon(tx.description);
            return (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                className="flex items-center gap-4 py-3"
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center",
                  tx.type === "credit" ? "bg-success/10" : "bg-primary/10"
                )}>
                  <Icon className={cn(
                    "h-5 w-5",
                    tx.type === "credit" ? "text-success" : "text-primary"
                  )} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {getTransactionTitle(tx)}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {tx.description || (tx.type === "credit" ? "Wallet Credit" : "Wallet Debit")}
                  </p>
                </div>

                <div className="text-right">
                  <p className={cn(
                    "font-semibold",
                    tx.type === "credit" ? "text-success" : "text-foreground"
                  )}>
                    {tx.type === "credit" ? "+" : "-"}₦{formatCurrency(tx.amount)}
                  </p>
                  <p className={cn(
                    "text-xs",
                    statusColors[tx.status]
                  )}>
                    {formatDate(tx.created_at)}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default TransactionsList;
