import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, Sparkles, Wallet, ArrowDownLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCashbackWallet } from "@/hooks/useCashback";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CashbackEntry {
  id: string;
  amount: number;
  reason: string | null;
  created_at: string;
  reference: string;
  type: "earned" | "spent" | "manual";
  service_type: string | null;
}

const Cashback = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { wallet, refetch } = useCashbackWallet();
  const [entries, setEntries] = useState<CashbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const fetchEntries = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("cashback_transactions")
      .select("id, amount, reason, created_at, reference, type, service_type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setEntries((data || []) as CashbackEntry[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
  }, [user]);

  const redeem = async () => {
    const amt = parseFloat(redeemAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount");
    if (!wallet || amt > wallet.balance) return toast.error("Amount exceeds cashback balance");

    setRedeeming(true);
    const { data, error } = await supabase.functions.invoke("redeem-cashback", {
      body: { amount: amt },
    });
    setRedeeming(false);

    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || "Redemption failed");
      return;
    }
    toast.success(`₦${amt.toLocaleString()} moved to your wallet`);
    setRedeemOpen(false);
    setRedeemAmount("");
    refetch();
    fetchEntries();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background pb-10">
      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 px-4 pt-4 pb-16 text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -left-6 top-20 w-28 h-28 rounded-full bg-white/5" />

        <div className="flex items-center gap-3 mb-6 relative z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/10 rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Cashback Wallet</h1>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs opacity-90">Cashback Balance</span>
          </div>
          <div className="text-3xl font-bold mb-4">
            ₦{(wallet?.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-1 text-xs">
            <div className="bg-white/10 rounded-xl px-3 py-2">
              <div className="opacity-80">Total Earned</div>
              <div className="font-semibold text-sm">₦{(wallet?.total_earned || 0).toLocaleString()}</div>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2">
              <div className="opacity-80">Total Used</div>
              <div className="font-semibold text-sm">₦{(wallet?.total_spent || 0).toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-8 max-w-lg mx-auto space-y-4 relative z-10">
        <button
          onClick={() => setRedeemOpen(true)}
          disabled={!wallet || wallet.balance <= 0}
          className="w-full bg-white dark:bg-card rounded-2xl p-4 flex items-center gap-3 border border-border shadow-sm active:scale-[0.99] transition disabled:opacity-60"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1 text-left">
            <div className="font-semibold text-sm">Move to Wallet</div>
            <div className="text-xs text-muted-foreground">Use cashback to fund purchases</div>
          </div>
        </button>

        <Card>
          <CardContent className="p-4">
            <h2 className="font-semibold text-sm mb-3">Cashback History</h2>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <Gift className="h-10 w-10 mx-auto mb-2 opacity-50" />
                No cashback activity yet
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {entries.map((e) => {
                  const isOut = e.type === "spent";
                  return (
                    <li key={e.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                            isOut
                              ? "bg-orange-100 dark:bg-orange-950"
                              : "bg-emerald-100 dark:bg-emerald-950",
                          )}
                        >
                          {isOut ? (
                            <ArrowDownLeft className="h-4 w-4 text-orange-600" />
                          ) : (
                            <Gift className="h-4 w-4 text-emerald-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {e.reason || (isOut ? "Cashback redeemed" : "Cashback earned")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "font-semibold text-sm whitespace-nowrap",
                          isOut ? "text-orange-600" : "text-emerald-600",
                        )}
                      >
                        {isOut ? "-" : "+"}₦{Number(e.amount).toLocaleString()}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move Cashback to Wallet</DialogTitle>
            <DialogDescription>
              Available: ₦{(wallet?.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="number"
              min="1"
              step="0.01"
              placeholder="Amount"
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setRedeemAmount(String(wallet?.balance || 0))}
              >
                Max
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={redeem}
                disabled={redeeming}
              >
                {redeeming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Move
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cashback;
