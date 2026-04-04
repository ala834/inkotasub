import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import PinEntryDialog from "@/components/common/PinEntryDialog";

interface InternetPlan { id: string; name: string; price: number; provider: string; plan_id: string; validity: string; }

const providers = [
  { id: "smile", name: "Smile 4G LTE" },
  { id: "spectranet", name: "Spectranet" },
  { id: "ipnx", name: "ipNX" },
  { id: "swift", name: "Swift Networks" },
];

const InternetServices = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [provider, setProvider] = useState("");
  const [accountId, setAccountId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [plans, setPlans] = useState<InternetPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPlans, setIsFetchingPlans] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);

  useEffect(() => {
    if (!provider) return;
    setIsFetchingPlans(true);
    setSelectedPlan("");
    // Fetch internet plans - using data plans endpoint with internet filter
    supabase.functions.invoke("get-data-plans", { body: { serviceType: "internet", provider } })
      .then(({ data }) => {
        if (data?.plans) {
          setPlans(data.plans.map((p: any) => ({
            id: p.plan_id || p.id,
            name: p.plan_name || p.name,
            price: p.price || p.base_price,
            provider: provider,
            plan_id: p.plan_id || p.id,
            validity: p.validity || "30 days",
          })));
        } else {
          setPlans([
            { id: "int_1gb", name: "1GB - 30 Days", price: 1000, provider, plan_id: "int_1gb", validity: "30 days" },
            { id: "int_2gb", name: "2GB - 30 Days", price: 1800, provider, plan_id: "int_2gb", validity: "30 days" },
            { id: "int_5gb", name: "5GB - 30 Days", price: 3500, provider, plan_id: "int_5gb", validity: "30 days" },
            { id: "int_10gb", name: "10GB - 30 Days", price: 6000, provider, plan_id: "int_10gb", validity: "30 days" },
            { id: "int_unlim", name: "Unlimited - 30 Days", price: 15000, provider, plan_id: "int_unlim", validity: "30 days" },
          ]);
        }
      })
      .finally(() => setIsFetchingPlans(false));
  }, [provider]);

  const plan = plans.find((p) => p.plan_id === selectedPlan);
  const amount = plan?.price || 0;

  const validateForm = () => {
    if (!provider || !accountId || !selectedPlan) { toast.error("Please fill all fields"); return false; }
    if (wallet && amount > wallet.balance) { toast.error("Insufficient balance"); return false; }
    return true;
  };

  const handlePurchaseClick = () => { if (validateForm()) setShowPinDialog(true); };

  const handlePurchaseWithPin = async (pin: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-data", {
        body: { network: provider.toUpperCase(), phoneNumber: accountId, planId: selectedPlan, amount, planName: plan?.name, transaction_pin: pin },
      });
      if (error) throw error;
      if (data?.success) { toast.success("Internet subscription activated!"); navigate("/dashboard"); }
      else throw new Error(data?.message || "Purchase failed");
    } catch (error: any) {
      throw new Error(error.message || "Failed to subscribe");
    } finally { setIsLoading(false); }
  };

  const selectedProvider = providers.find((p) => p.id === provider);

  return (
    <div className="min-h-screen gradient-hero pb-6">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full"><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-lg font-display font-bold">Internet Services</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
              <p className="text-xl font-bold text-foreground">₦{(wallet?.balance ?? 0).toLocaleString()}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/fund-wallet")} className="rounded-xl">Fund Wallet</Button>
          </div>

          <div className="glass-card rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="font-medium">Internet Subscription</p>
                <p className="text-sm text-muted-foreground">Subscribe to broadband internet</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Select Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Choose provider" /></SelectTrigger>
                <SelectContent>{providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Account ID / Phone Number</Label>
              <Input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="Enter account ID" className="h-12 rounded-xl" />
            </div>

            {provider && (
              <div className="space-y-2">
                <Label>Select Plan</Label>
                {isFetchingPlans ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="space-y-2">
                    {plans.map((p) => (
                      <button key={p.plan_id} onClick={() => setSelectedPlan(p.plan_id)} className={`w-full p-3 rounded-xl border-2 text-left transition-all ${selectedPlan === p.plan_id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium text-sm">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.validity}</p>
                          </div>
                          <span className="font-bold text-foreground">₦{(p.price ?? 0).toLocaleString()}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button onClick={handlePurchaseClick} disabled={isLoading || !provider || !accountId || !selectedPlan} className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : `Subscribe ₦${amount.toLocaleString()}`}
          </Button>
        </motion.div>
      </main>

      <PinEntryDialog open={showPinDialog} onOpenChange={setShowPinDialog} onSubmit={handlePurchaseWithPin} title="Confirm Subscription" description="Enter PIN to subscribe" amount={amount} serviceName={`${selectedProvider?.name || provider} Internet`} />
    </div>
  );
};

export default InternetServices;
