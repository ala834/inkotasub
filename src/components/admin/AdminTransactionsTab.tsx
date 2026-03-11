import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpRight, ArrowDownLeft, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TransactionWithProfit {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  created_at: string;
  profit: number | null;
  cost_price: number | null;
  service_type: string | null;
  recipient: string | null;
}

const AdminTransactionsTab = () => {
  const [transactions, setTransactions] = useState<TransactionWithProfit[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, [statusFilter]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    
    // Join transactions with vtu_orders to get profit data
    let query = supabase
      .from("transactions")
      .select(`
        *,
        vtu_orders:vtu_orders!left(transaction_id, profit, cost_price, service_type, recipient)
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter as "pending" | "success" | "failed");
    }

    const { data, error } = await query;

    if (!error && data) {
      setTransactions(
        data.map((t) => ({
          ...t,
          amount: parseFloat(t.amount as unknown as string),
          profit: t.vtu_orders?.[0]?.profit 
            ? parseFloat(t.vtu_orders[0].profit as unknown as string) 
            : null,
          cost_price: t.vtu_orders?.[0]?.cost_price 
            ? parseFloat(t.vtu_orders[0].cost_price as unknown as string) 
            : null,
          service_type: t.vtu_orders?.[0]?.service_type || null,
          recipient: t.vtu_orders?.[0]?.recipient || null,
        }))
      );
    }
    setIsLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "text-green-500 bg-green-500/10";
      case "pending":
        return "text-yellow-500 bg-yellow-500/10";
      case "failed":
        return "text-red-500 bg-red-500/10";
      default:
        return "text-muted-foreground bg-muted";
    }
  };

  const getServiceLabel = (serviceType: string | null, description: string | null) => {
    if (serviceType) {
      return serviceType.charAt(0).toUpperCase() + serviceType.slice(1);
    }
    if (description?.toLowerCase().includes("airtime")) return "Airtime";
    if (description?.toLowerCase().includes("data")) return "Data";
    if (description?.toLowerCase().includes("electricity")) return "Electricity";
    if (description?.toLowerCase().includes("cable")) return "Cable TV";
    if (description?.toLowerCase().includes("exam")) return "Exam Card";
    return "Wallet";
  };

  return (
    <div className="space-y-4">
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="h-12 rounded-xl">
          <SelectValue placeholder="Filter by status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Transactions</SelectItem>
          <SelectItem value="success">Successful</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div key={tx.id} className="glass-card rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                      tx.type === "credit" ? "bg-success/10" : "bg-destructive/10"
                    )}
                  >
                    {tx.type === "credit" ? (
                      <ArrowDownLeft className="h-5 w-5 text-success" />
                    ) : (
                      <ArrowUpRight className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{tx.description || "Transaction"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), "MMM d, yyyy • h:mm a")}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                        {getServiceLabel(tx.service_type, tx.description)}
                      </span>
                      {tx.recipient && (
                        <span className="text-xs text-muted-foreground">
                          To: {tx.recipient}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "font-semibold",
                      tx.type === "credit" ? "text-success" : "text-destructive"
                    )}
                  >
                    {tx.type === "credit" ? "+" : "-"}
                    {formatCurrency(tx.amount)}
                  </p>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full capitalize",
                      getStatusColor(tx.status)
                    )}
                  >
                    {tx.status}
                  </span>
                </div>
              </div>

              {/* Profit Section - Only show for successful VTU transactions with profit */}
              {tx.profit !== null && tx.status === "success" && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span>Provider Cost:</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(tx.cost_price || 0)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Profit:</span>
                        <span className="font-semibold text-green-500">
                          +{formatCurrency(tx.profit)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Margin: {((tx.profit / tx.amount) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminTransactionsTab;
