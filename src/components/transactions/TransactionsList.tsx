import { motion } from "framer-motion";
import { Wallet, Smartphone, Wifi, Tv, ChevronRight } from "lucide-react";
import TransactionItem from "./TransactionItem";
import { Button } from "@/components/ui/button";

const recentTransactions = [
  {
    id: 1,
    type: "credit" as const,
    title: "Wallet Funded",
    description: "Bank Transfer",
    amount: 10000,
    date: "Today, 2:30 PM",
    icon: Wallet,
    status: "success" as const,
  },
  {
    id: 2,
    type: "debit" as const,
    title: "MTN Data",
    description: "2GB - 08012345678",
    amount: 500,
    date: "Today, 1:15 PM",
    icon: Wifi,
    status: "success" as const,
  },
  {
    id: 3,
    type: "debit" as const,
    title: "Airtel Airtime",
    description: "08098765432",
    amount: 1000,
    date: "Yesterday",
    icon: Smartphone,
    status: "success" as const,
  },
  {
    id: 4,
    type: "debit" as const,
    title: "DSTV Subscription",
    description: "Compact Plus",
    amount: 21000,
    date: "Jan 5, 2025",
    icon: Tv,
    status: "success" as const,
  },
];

const TransactionsList = () => {
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
        <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
          See All
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <div className="divide-y divide-border/50">
        {recentTransactions.map((transaction, index) => (
          <TransactionItem
            key={transaction.id}
            {...transaction}
            delay={0.1 + index * 0.05}
          />
        ))}
      </div>
    </motion.div>
  );
};

export default TransactionsList;
