import { useState } from "react";
import { motion } from "framer-motion";
import { Search, ArrowLeft, ArrowDownLeft, ArrowUpRight, Loader2, SlidersHorizontal, X, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/layout/BottomNav";
import { useTransactions, Transaction } from "@/hooks/useTransactions";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const statusTabs = [
  { value: "all" as const, label: "All" },
  { value: "success" as const, label: "Successful" },
  { value: "pending" as const, label: "Pending" },
  { value: "failed" as const, label: "Failed" },
];

const History = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "success" | "failed">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { transactions, isLoading } = useTransactions({
    status: statusFilter,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });

  const filteredTransactions = transactions.filter(t =>
    t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.reference?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(amount);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success": return "text-green-600 bg-green-50";
      case "pending": return "text-amber-600 bg-amber-50";
      case "failed": return "text-red-500 bg-red-50";
      default: return "text-gray-500 bg-gray-100";
    }
  };

  const isDepositCharge = (tx: Transaction) =>
    (tx.metadata as any)?.type === "deposit_charge" || tx.description?.toLowerCase().includes("deposit processing fee");

  const getTransactionLabel = (tx: Transaction) => {
    if (isDepositCharge(tx)) return "Deposit Charge";
    const desc = tx.description?.toLowerCase() || "";
    if (desc.includes("funding") || desc.includes("wallet funded") || desc.includes("credit"))
      return tx.type === "credit" ? "Wallet Funded" : tx.description || "Transaction";
    if (desc.includes("referral")) return "Referral Bonus";
    if (desc.includes("data")) return "Data Purchase";
    if (desc.includes("airtime")) return "Airtime Purchase";
    if (desc.includes("electricity")) return "Electricity Payment";
    if (desc.includes("cable") || desc.includes("tv")) return "Cable TV Subscription";
    if (desc.includes("transfer")) return tx.type === "debit" ? "Transfer Sent" : "Transfer Received";
    return tx.description || "Transaction";
  };

  // Group transactions by date
  const groupedTransactions: Record<string, Transaction[]> = {};
  filteredTransactions.forEach(tx => {
    const dateKey = format(new Date(tx.created_at), "yyyy-MM-dd");
    if (!groupedTransactions[dateKey]) groupedTransactions[dateKey] = [];
    groupedTransactions[dateKey].push(tx);
  });

  const hasActiveFilters = startDate || endDate;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Green Header */}
      <header className="bg-gradient-to-r from-green-600 to-green-500 px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Transaction History</h1>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-full transition-colors",
            showFilters ? "bg-white/30" : "bg-white/20 active:bg-white/30"
          )}
        >
          <SlidersHorizontal className="h-5 w-5 text-white" />
        </button>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Search */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search transactions..."
              className="w-full h-12 pl-11 pr-4 bg-white border border-gray-200 rounded-2xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-sm shadow-sm"
            />
          </div>
        </motion.div>

        {/* Status Tabs */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
          <div className="flex bg-white rounded-xl p-1 border border-gray-100 shadow-sm">
            {statusTabs.map(tab => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-semibold transition-all",
                  statusFilter === tab.value
                    ? "bg-green-500 text-white shadow-sm"
                    : "text-gray-500 active:bg-gray-50"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Date Filters */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Date Range</p>
              {hasActiveFilters && (
                <button
                  onClick={() => { setStartDate(""); setEndDate(""); }}
                  className="text-xs text-green-600 font-medium flex items-center gap-1 active:text-green-700"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Transactions List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 text-green-500 animate-spin" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Search className="h-7 w-7 text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">No transactions found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([dateKey, txs]) => (
            <div key={dateKey} className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
                {format(new Date(dateKey), "EEEE, MMM d, yyyy")}
              </p>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                {txs.map(transaction => (
                  <motion.button
                    key={transaction.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => navigate(`/receipt/${transaction.id}`)}
                    className="w-full flex items-center gap-3 p-4 text-left active:bg-gray-50 transition-colors"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                      isDepositCharge(transaction) ? "bg-red-50" :
                      transaction.type === "credit" ? "bg-green-50" : "bg-red-50"
                    )}>
                      {transaction.type === "credit" && !isDepositCharge(transaction)
                        ? <ArrowDownLeft className="h-5 w-5 text-green-500" />
                        : <ArrowUpRight className="h-5 w-5 text-red-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{getTransactionLabel(transaction)}</p>
                      <p className="text-xs text-gray-400">{format(new Date(transaction.created_at), "h:mm a")}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn(
                        "font-bold text-sm",
                        isDepositCharge(transaction) ? "text-red-500" :
                        transaction.type === "credit" ? "text-green-600" : "text-red-500"
                      )}>
                        {transaction.type === "credit" ? "+" : "-"}{formatCurrency(transaction.amount)}
                      </p>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full capitalize font-medium", getStatusColor(transaction.status))}>
                        {transaction.status}
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default History;
