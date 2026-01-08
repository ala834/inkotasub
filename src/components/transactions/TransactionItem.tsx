import { motion } from "framer-motion";
import { LucideIcon, ArrowUpRight, ArrowDownLeft } from "lucide-react";

interface TransactionItemProps {
  type: "credit" | "debit";
  title: string;
  description: string;
  amount: number;
  date: string;
  icon: LucideIcon;
  status?: "success" | "pending" | "failed";
  delay?: number;
}

const TransactionItem = ({
  type,
  title,
  description,
  amount,
  date,
  icon: Icon,
  status = "success",
  delay = 0,
}: TransactionItemProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const statusColors = {
    success: "text-success",
    pending: "text-warning",
    failed: "text-destructive",
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-center gap-4 py-3"
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
        type === "credit" ? "bg-success/10" : "bg-primary/10"
      }`}>
        <Icon className={`h-5 w-5 ${
          type === "credit" ? "text-success" : "text-primary"
        }`} />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{title}</p>
        <p className="text-sm text-muted-foreground truncate">{description}</p>
      </div>

      <div className="text-right">
        <p className={`font-semibold ${
          type === "credit" ? "text-success" : "text-foreground"
        }`}>
          {type === "credit" ? "+" : "-"}₦{formatCurrency(amount)}
        </p>
        <p className="text-xs text-muted-foreground">{date}</p>
      </div>
    </motion.div>
  );
};

export default TransactionItem;
