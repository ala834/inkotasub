import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import PinEntryDialog from "@/components/common/PinEntryDialog";

interface DataPlan { id: string; name: string; price: number; network: string; plan_id: string; }
interface BulkEntry { id: string; phoneNumber: string; network: string; planId: string; price: number; }

const networks = ["MTN", "GLO", "AIRTEL", "9MOBILE"];

const BulkData = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [entries, setEntries] = useState<BulkEntry[]>([{ id: crypto.randomUUID(), phoneNumber: "", network: "", planId: "", price: 0 }]);
  const [plans, setPlans] = useState<DataPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [results, setResults] = useState<{ phone: string; status: string; message: string }[]>([]);

  useEffect(() => {
    supabase.functions.invoke("get-data-plans").then(({ data }) => {
      if (data?.plans) setPlans(data.plans.map((p: any) => ({ id: p.plan_id || p.id, name: p.plan_name || p.name, price: p.price || p.base_price, network: p.network, plan_id: p.plan_id || p.id })));
    });
  }, []);

  const addEntry = () => {
    if (entries.length >= 20) { toast.error("Maximum 20 entries"); return; }
    setEntries([...entries, { id: crypto.randomUUID(), phoneNumber: "", network: "", planId: "", price: 0 }]);
  };

  const removeEntry = (id: string) => { if (entries.length <= 1) return; setEntries(entries.filter((e) => e.id !== id)); };

  const updateEntry = (id: string, field: keyof BulkEntry, value: any) => {
    setEntries(entries.map((e) => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: value };
      if (field === "planId") {
        const plan = plans.find((p) => p.plan_id === value);
        updated.price = plan?.price || 0;
      }
      if (field === "network") updated.planId = "";
      return updated;
    }));
  };

  const totalAmount = entries.reduce((sum, e) => sum + e.price, 0);
  const getNetworkPlans = (network: string) => plans.filter((p) => p.network?.toUpperCase() === network.toUpperCase());

  const validateForm = () => {
    const valid = entries.every((e) => e.phoneNumber.length >= 11 && e.network && e.planId);
    if (!valid) { toast.error("Please fill all entries"); return false; }
    if (wallet && totalAmount > wallet.balance) { toast.error("Insufficient balance"); return false; }
    return true;
  };

  const handlePurchaseClick = () => { if (validateForm()) setShowPinDialog(true); };

  const handlePurchaseWithPin = async (pin: string) => {
    setIsLoading(true);
    const batchResults: typeof results = [];
    try {
      for (const entry of entries) {
        try {
          const plan = plans.find((p) => p.plan_id === entry.planId);
          const { data, error } = await supabase.functions.invoke("purchase-data", {
            body: { network: entry.network, phoneNumber: entry.phoneNumber, planId: entry.planId, amount: entry.price, planName: plan?.name, transaction_pin: pin },
          });
          batchResults.push({ phone: entry.phoneNumber, status: data?.success ? "success" : "failed", message: data?.message || error?.message || "Error" });
        } catch (err: any) {
          batchResults.push({ phone: entry.phoneNumber, status: "failed", message: err.message });
        }
      }
      setResults(batchResults);
      const successCount = batchResults.filter((r) => r.status === "success").length;
      if (successCount === entries.length) toast.success("All data purchased!");
      else if (successCount > 0) toast.warning(`${successCount}/${entries.length} succeeded`);
      else throw new Error("All failed");
    } catch (error: any) {
      throw new Error(error.message || "Bulk purchase failed");
    } finally { setIsLoading(false); }
  };

  return (
    <div className="min-h-screen gradient-hero pb-6">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full"><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-lg font-display font-bold">Bulk Data</h1>
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
              <Button variant="outline" size="sm" onClick={addEntry} className="rounded-xl gap-1"><Plus className="h-4 w-4" /> Add</Button>
            </div>

            {entries.map((entry, idx) => (
              <motion.div key={entry.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-2 p-3 rounded-xl border border-border/50 bg-card/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Recipient #{idx + 1}</span>
                  {entries.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeEntry(entry.id)} className="h-6 w-6 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                  )}
                </div>
                <Input value={entry.phoneNumber} onChange={(e) => updateEntry(entry.id, "phoneNumber", e.target.value)} placeholder="08012345678" className="h-10 rounded-xl" />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={entry.network} onValueChange={(v) => updateEntry(entry.id, "network", v)}>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Network" /></SelectTrigger>
                    <SelectContent>{networks.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={entry.planId} onValueChange={(v) => updateEntry(entry.id, "planId", v)} disabled={!entry.network}>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Plan" /></SelectTrigger>
                    <SelectContent>{getNetworkPlans(entry.network).map((p) => <SelectItem key={p.plan_id} value={p.plan_id}>{p.name} - ₦{p.price}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </motion.div>
            ))}
          </div>

          {results.length > 0 && (
            <div className="glass-card rounded-2xl p-4 space-y-2">
              <Label className="text-base font-semibold">Results</Label>
              {results.map((r, i) => (
                <div key={i} className={`flex justify-between items-center p-2 rounded-xl text-sm ${r.status === "success" ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                  <span>{r.phone}</span><span className="font-medium capitalize">{r.status}</span>
                </div>
              ))}
            </div>
          )}

          <div className="glass-card rounded-2xl p-4 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Amount</span>
            <span className="text-xl font-bold text-foreground">₦{totalAmount.toLocaleString()}</span>
          </div>

          <Button onClick={handlePurchaseClick} disabled={isLoading} className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : `Buy Bulk Data (₦${totalAmount.toLocaleString()})`}
          </Button>
        </motion.div>
      </main>

      <PinEntryDialog open={showPinDialog} onOpenChange={setShowPinDialog} onSubmit={handlePurchaseWithPin} title="Confirm Bulk Data" description={`Buy data for ${entries.length} numbers`} amount={totalAmount} serviceName="Bulk Data" />
    </div>
  );
};

export default BulkData;
