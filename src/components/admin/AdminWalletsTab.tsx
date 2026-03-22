import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Search, Wallet, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface WalletWithProfile {
  id: string;
  user_id: string;
  balance: number;
  profile?: {
    full_name: string | null;
  };
}

const AdminWalletsTab = () => {
  const { user: currentAdmin } = useAuth();
  const [wallets, setWallets] = useState<WalletWithProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWallet, setSelectedWallet] = useState<WalletWithProfile | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);

  useEffect(() => {
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("wallets")
      .select(`
        *,
        profile:profiles!wallets_user_id_fkey(full_name)
      `)
      .order("balance", { ascending: false });

    if (!error && data) {
      setWallets(
        data.map((w) => ({
          ...w,
          balance: parseFloat(w.balance as unknown as string),
          profile: Array.isArray(w.profile) ? w.profile[0] : w.profile,
        }))
      );
    }
    setIsLoading(false);
  };

  const handleAdjustWallet = async () => {
    if (!selectedWallet || !amount || !reason.trim()) {
      toast.error("Please provide amount and reason");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (adjustmentType === "debit" && amountNum > selectedWallet.balance) {
      toast.error("Insufficient balance");
      return;
    }

    setIsAdjusting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-adjust-wallet", {
        body: {
          wallet_id: selectedWallet.id,
          user_id: selectedWallet.user_id,
          adjustment_type: adjustmentType,
          amount: amountNum,
          reason: reason.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(data.message || `Wallet ${adjustmentType === "credit" ? "credited" : "debited"} successfully`);
      setSelectedWallet(null);
      setAmount("");
      setReason("");
      fetchWallets();
    } catch (error: any) {
      toast.error(error.message || "Failed to adjust wallet");
    } finally {
      setIsAdjusting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
    }).format(amount);
  };

  const filteredWallets = wallets.filter((w) =>
    w.profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name..."
          className="pl-10 h-12 rounded-xl"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredWallets.map((wallet) => (
            <div
              key={wallet.id}
              className="glass-card rounded-2xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{wallet.profile?.full_name || "Unknown"}</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(wallet.balance)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedWallet(wallet);
                    setAdjustmentType("credit");
                  }}
                  className="rounded-xl"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedWallet(wallet);
                    setAdjustmentType("debit");
                  }}
                  className="rounded-xl"
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Adjustment Dialog */}
      <Dialog open={!!selectedWallet} onOpenChange={() => setSelectedWallet(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {adjustmentType === "credit" ? "Credit" : "Debit"} Wallet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">User</p>
              <p className="font-medium">{selectedWallet?.profile?.full_name || "Unknown"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="font-bold text-lg text-primary">
                {formatCurrency(selectedWallet?.balance || 0)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Amount (₦) *</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for this adjustment..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setSelectedWallet(null);
              setAmount("");
              setReason("");
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleAdjustWallet}
              disabled={isAdjusting || !amount || !reason.trim()}
              className={adjustmentType === "credit" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {isAdjusting ? "Processing..." : adjustmentType === "credit" ? "Credit" : "Debit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminWalletsTab;
