import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Wallet,
  ArrowDownToLine,
  Clock,
  CheckCircle2,
  XCircle,
  Banknote,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ProfitWithdrawal {
  id: string;
  admin_id: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: string;
  notes: string | null;
  created_at: string;
  processed_at: string | null;
}

const AdminProfitWithdrawalTab = () => {
  const { user } = useAuth();
  const [totalProfit, setTotalProfit] = useState(0);
  const [withdrawals, setWithdrawals] = useState<ProfitWithdrawal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    await Promise.all([fetchTotalProfit(), fetchWithdrawals()]);
    setIsLoading(false);
  };

  const fetchTotalProfit = async () => {
    // Sum all profits from vtu_orders
    const { data, error } = await supabase
      .from("vtu_orders")
      .select("profit")
      .eq("status", "success")
      .not("profit", "is", null);

    if (!error && data) {
      const total = data.reduce(
        (sum, order) => sum + (parseFloat(order.profit as unknown as string) || 0),
        0
      );

      // Subtract already withdrawn amounts
      const { data: withdrawn } = await supabase
        .from("profit_withdrawals")
        .select("amount, status")
        .in("status", ["pending", "completed"]);

      const totalWithdrawn = (withdrawn || []).reduce(
        (sum, w) => sum + parseFloat(w.amount as unknown as string),
        0
      );

      setTotalProfit(total - totalWithdrawn);
    }
  };

  const fetchWithdrawals = async () => {
    const { data, error } = await supabase
      .from("profit_withdrawals")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setWithdrawals(
        data.map((w) => ({
          ...w,
          amount: parseFloat(w.amount as unknown as string),
        }))
      );
    }
  };

  const handleWithdraw = async () => {
    if (!user) return;

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (amountNum > totalProfit) {
      toast.error("Amount exceeds available profit balance");
      return;
    }
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      toast.error("Please fill in all bank details");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("profit_withdrawals").insert({
        admin_id: user.id,
        amount: amountNum,
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        account_name: accountName.trim(),
        notes: notes.trim() || null,
        status: "pending",
      } as any);

      if (error) throw error;

      // Log admin activity
      await supabase.from("admin_activity_log").insert({
        admin_id: user.id,
        action: "profit_withdrawal_request",
        target_type: "profit",
        details: { amount: amountNum, bank_name: bankName, account_number: accountNumber },
      } as any);

      toast.success("Withdrawal request submitted successfully");
      setShowWithdrawDialog(false);
      resetForm();
      fetchData();
    } catch {
      toast.error("Failed to submit withdrawal request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("profit_withdrawals")
      .update({
        status: newStatus,
        processed_at: newStatus === "completed" || newStatus === "rejected" ? new Date().toISOString() : null,
      } as any)
      .eq("id", id);

    if (error) {
      toast.error("Failed to update status");
      return;
    }

    toast.success(`Withdrawal ${newStatus}`);
    fetchData();
  };

  const resetForm = () => {
    setAmount("");
    setBankName("");
    setAccountNumber("");
    setAccountName("");
    setNotes("");
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(val);

  const statusConfig: Record<string, { color: string; icon: typeof Clock }> = {
    pending: { color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: Clock },
    completed: { color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle2 },
    rejected: { color: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle },
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profit Balance Card */}
      <Card className="border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">Available Profit Balance</p>
              <p className="text-3xl font-bold text-primary mt-1">
                {formatCurrency(totalProfit)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Total earnings from VTU service margins
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={fetchData}
                className="rounded-xl"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setShowWithdrawDialog(true)}
                className="rounded-xl gap-2"
                disabled={totalProfit <= 0}
              >
                <ArrowDownToLine className="h-4 w-4" />
                Withdraw Profit
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawal History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Withdrawal History
          </CardTitle>
          <CardDescription>Track all profit withdrawal requests</CardDescription>
        </CardHeader>
        <CardContent>
          {withdrawals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No withdrawal requests yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((w) => {
                const config = statusConfig[w.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                return (
                  <div
                    key={w.id}
                    className="glass-card rounded-2xl p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.color}`}>
                        <StatusIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{formatCurrency(w.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {w.bank_name} • {w.account_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(w.created_at), "MMM dd, yyyy • HH:mm")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={config.color}>
                        {w.status}
                      </Badge>
                      {w.status === "pending" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-green-600 hover:text-green-700"
                            onClick={() => handleUpdateStatus(w.id, "completed")}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-red-600 hover:text-red-700"
                            onClick={() => handleUpdateStatus(w.id, "rejected")}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Withdraw Dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Request Profit Withdrawal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-primary/5 text-center">
              <p className="text-xs text-muted-foreground">Available Balance</p>
              <p className="text-xl font-bold text-primary">{formatCurrency(totalProfit)}</p>
            </div>
            <div className="space-y-2">
              <Label>Amount (₦) *</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter withdrawal amount"
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Bank Name *</Label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Access Bank"
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Number *</Label>
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Enter 10-digit account number"
                maxLength={10}
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Account holder name"
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowWithdrawDialog(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={isSubmitting || !amount || !bankName || !accountNumber || !accountName}
            >
              {isSubmitting ? "Submitting..." : "Submit Withdrawal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminProfitWithdrawalTab;
