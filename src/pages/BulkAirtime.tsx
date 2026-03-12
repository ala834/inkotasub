import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import PinEntryDialog from "@/components/common/PinEntryDialog";

interface BulkEntry {
  id: string;
  phoneNumber: string;
  amount: string;
}

const BulkAirtime = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [entries, setEntries] = useState<BulkEntry[]>([
    { id: crypto.randomUUID(), phoneNumber: "", amount: "" },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [results, setResults] = useState<{ phone: string; status: string; message: string }[]>([]);

  const addEntry = () => {
    if (entries.length >= 20) {
      toast.error("Maximum 20 entries per batch");
      return;
    }
    setEntries([...entries, { id: crypto.randomUUID(), phoneNumber: "", amount: "" }]);
  };

  const removeEntry = (id: string) => {
    if (entries.length <= 1) return;
    setEntries(entries.filter((e) => e.id !== id));
  };

  const updateEntry = (id: string, field: "phoneNumber" | "amount", value: string) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const totalAmount = entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  const validateForm = () => {
    const valid = entries.every((e) => e.phoneNumber.length >= 11 && parseFloat(e.amount) > 0);
    if (!valid) { toast.error("Please fill all entries correctly"); return false; }
    if (wallet && totalAmount > wallet.balance) { toast.error("Insufficient wallet balance"); return false; }
    return true;
  };

  const handlePurchaseClick = () => { if (validateForm()) setShowPinDialog(true); };

  const handlePurchaseWithPin = async (pin: string) => {
    setIsLoading(true);
    const batchResults: typeof results = [];
    try {
      for (const entry of entries) {
        try {
          const { data, error } = await supabase.functions.invoke("purchase-airtime", {
            body: { network: "AUTO", phoneNumber: entry.phoneNumber, amount: parseFloat(entry.amount), transaction_pin: pin },
          });
          batchResults.push({
            phone: entry.phoneNumber,
            status: data?.success ? "success" : "failed",
            message: data?.message || error?.message || "Unknown error",
          });
        } catch (err: any) {
          batchResults.push({ phone: entry.phoneNumber, status: "failed", message: err.message });
        }
      }
      setResults(batchResults);
      const successCount = batchResults.filter((r) => r.status === "success").length;
      if (successCount === entries.length) toast.success("All airtime purchased successfully!");
      else if (successCount > 0) toast.warning(`${successCount}/${entries.length} purchases succeeded`);
      else throw new Error("All purchases failed");
    } catch (error: any) {
      throw new Error(error.message || "Bulk purchase failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero pb-6">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold">Bulk Airtime</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
              <p className="text-xl font-bold text-foreground">₦{wallet?.balance.toLocaleString() || "0.00"}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/fund-wallet")} className="rounded-xl">Fund Wallet</Button>
          </div>

          <div className="glass-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Recipients ({entries.length})</Label>
              <Button variant="outline" size="sm" onClick={addEntry} className="rounded-xl gap-1">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            {entries.map((entry, idx) => (
              <motion.div key={entry.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Phone #{idx + 1}</Label>
                  <Input value={entry.phoneNumber} onChange={(e) => updateEntry(entry.id, "phoneNumber", e.target.value)} placeholder="08012345678" className="h-10 rounded-xl" />
                </div>
                <div className="w-28">
                  <Label className="text-xs text-muted-foreground">Amount</Label>
                  <Input type="number" value={entry.amount} onChange={(e) => updateEntry(entry.id, "amount", e.target.value)} placeholder="₦" className="h-10 rounded-xl" />
                </div>
                {entries.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeEntry(entry.id)} className="h-10 w-10 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </motion.div>
            ))}
          </div>

          {results.length > 0 && (
            <div className="glass-card rounded-2xl p-4 space-y-2">
              <Label className="text-base font-semibold">Results</Label>
              {results.map((r, i) => (
                <div key={i} className={`flex justify-between items-center p-2 rounded-xl text-sm ${r.status === "success" ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                  <span>{r.phone}</span>
                  <span className="font-medium capitalize">{r.status}</span>
                </div>
              ))}
            </div>
          )}

          <div className="glass-card rounded-2xl p-4 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Amount</span>
            <span className="text-xl font-bold text-foreground">₦{totalAmount.toLocaleString()}</span>
          </div>

          <Button onClick={handlePurchaseClick} disabled={isLoading || entries.length === 0} className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : `Buy Bulk Airtime (₦${totalAmount.toLocaleString()})`}
          </Button>
        </motion.div>
      </main>

      <PinEntryDialog open={showPinDialog} onOpenChange={setShowPinDialog} onSubmit={handlePurchaseWithPin} title="Confirm Bulk Purchase" description={`Buy airtime for ${entries.length} numbers`} amount={totalAmount} serviceName="Bulk Airtime" />
    </div>
  );
};

export default BulkAirtime;
