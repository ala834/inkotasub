import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Tv, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import TransactionConfirmationDialog from "@/components/common/TransactionConfirmationDialog";
import RecentNumbers from "@/components/common/RecentNumbers";
import { useRecentNumbers } from "@/hooks/useRecentNumbers";

const providers = [
  { id: "dstv", name: "DSTV", color: "bg-blue-600" },
  { id: "gotv", name: "GOtv", color: "bg-green-600" },
  { id: "startimes", name: "StarTimes", color: "bg-yellow-600" },
];

interface CablePlan {
  id: string;
  name: string;
  amount: number;
}

const CableTV = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [provider, setProvider] = useState("");
  const [smartCardNumber, setSmartCardNumber] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<CablePlan | null>(null);
  const [plans, setPlans] = useState<CablePlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [isValidated, setIsValidated] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const { recentNumbers, addRecentNumber, clearRecentNumbers } = useRecentNumbers("cable");

  useEffect(() => {
    if (provider) fetchPlans();
  }, [provider]);

  const fetchPlans = async () => {
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-cable-plans", {
        body: { provider },
      });
      if (error) throw error;
      setPlans(data?.plans || getMockPlans());
    } catch (error) {
      setPlans(getMockPlans());
    } finally {
      setLoadingPlans(false);
    }
  };

  const getMockPlans = (): CablePlan[] => {
    if (provider === "dstv") {
      return [
        { id: "padi", name: "DStv Padi", amount: 2500 },
        { id: "yanga", name: "DStv Yanga", amount: 3500 },
        { id: "confam", name: "DStv Confam", amount: 6200 },
        { id: "compact", name: "DStv Compact", amount: 10500 },
        { id: "compact_plus", name: "DStv Compact Plus", amount: 16600 },
        { id: "premium", name: "DStv Premium", amount: 24500 },
      ];
    } else if (provider === "gotv") {
      return [
        { id: "supa", name: "GOtv Supa", amount: 6400 },
        { id: "max", name: "GOtv Max", amount: 4850 },
        { id: "jolli", name: "GOtv Jolli", amount: 3300 },
        { id: "jinja", name: "GOtv Jinja", amount: 2250 },
        { id: "smallie", name: "GOtv Smallie", amount: 1100 },
      ];
    } else {
      return [
        { id: "nova", name: "StarTimes Nova", amount: 1200 },
        { id: "basic", name: "StarTimes Basic", amount: 2000 },
        { id: "smart", name: "StarTimes Smart", amount: 2800 },
        { id: "classic", name: "StarTimes Classic", amount: 3000 },
        { id: "super", name: "StarTimes Super", amount: 5500 },
      ];
    }
  };

  const handleValidate = async () => {
    if (!provider || !smartCardNumber) {
      toast.error("Please select provider and enter smart card number");
      return;
    }
    setIsValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-smartcard", {
        body: { provider, smartCardNumber },
      });
      if (error) throw error;
      if (data?.customerName) {
        setCustomerName(data.customerName);
        setIsValidated(true);
        toast.success("Smart card validated successfully!");
      } else {
        throw new Error("Invalid smart card number");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to validate smart card");
      setIsValidated(false);
      setCustomerName("");
    } finally {
      setIsValidating(false);
    }
  };

  const validateForm = () => {
    if (!isValidated || !selectedPlan) {
      toast.error("Please validate smart card and select a plan");
      return false;
    }
    if (wallet && selectedPlan.amount > wallet.balance) {
      toast.error("Insufficient wallet balance");
      return false;
    }
    return true;
  };

  const handlePurchaseClick = () => {
    if (validateForm()) setShowPinDialog(true);
  };

  const handlePurchaseWithPin = async (pin: string) => {
    if (!selectedPlan) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-cable", {
        body: {
          provider,
          smartCardNumber,
          planId: selectedPlan.id,
          amount: selectedPlan.amount,
          customerName,
          transaction_pin: pin,
        },
      });
      if (error) throw error;
      if (data?.success) {
        addRecentNumber(smartCardNumber, customerName || undefined);
        toast.success("Cable subscription successful!");
        navigate("/dashboard");
      } else {
        throw new Error(data?.message || "Subscription failed");
      }
    } catch (error: any) {
      throw new Error(error.message || "Failed to subscribe");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedProvider = providers.find(p => p.id === provider);

  return (
    <div className="min-h-screen gradient-hero pb-6">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold">Cable TV Subscription</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Wallet Balance */}
          <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
              <p className="text-xl font-bold text-foreground">₦{wallet?.balance.toLocaleString() || "0.00"}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/fund-wallet")} className="rounded-xl">
              Fund Wallet
            </Button>
          </div>

          {/* Provider Selection */}
          <div className="glass-card rounded-2xl p-4">
            <Label className="text-muted-foreground mb-3 block">Select Provider</Label>
            <div className="grid grid-cols-3 gap-3">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProvider(p.id); setSelectedPlan(null); setIsValidated(false); }}
                  className={cn(
                    "p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2",
                    provider === p.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white", p.color)}>
                    <Tv className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Smart Card Number */}
          {provider && (
            <div className="glass-card rounded-2xl p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="smartcard">Smart Card / IUC Number</Label>
                <Input
                  id="smartcard"
                  value={smartCardNumber}
                  onChange={(e) => { setSmartCardNumber(e.target.value); setIsValidated(false); }}
                  placeholder="Enter smart card number"
                  className="h-12 rounded-xl"
                />
              </div>

              {/* Recent smartcard numbers */}
              <RecentNumbers
                numbers={recentNumbers}
                onSelect={(num) => { setSmartCardNumber(num); setIsValidated(false); }}
                onClear={clearRecentNumbers}
              />

              <Button
                onClick={handleValidate}
                disabled={isValidating || !smartCardNumber}
                variant="outline"
                className="w-full h-12 rounded-xl"
              >
                {isValidating ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isValidated ? (
                  <>
                    <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
                    {customerName}
                  </>
                ) : (
                  "Validate Smart Card"
                )}
              </Button>
            </div>
          )}

          {/* Cable Plans */}
          {isValidated && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-4">
              <Label className="text-muted-foreground mb-3 block">Select Plan</Label>
              {loadingPlans ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-2">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      className={cn(
                        "w-full p-4 rounded-xl border-2 transition-all flex justify-between items-center",
                        selectedPlan?.id === plan.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <span className="font-medium">{plan.name}</span>
                      <span className="font-bold text-primary">₦{plan.amount.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Submit */}
          <Button
            onClick={handlePurchaseClick}
            disabled={isLoading || !isValidated || !selectedPlan}
            className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : selectedPlan ? (
              `Pay ₦${selectedPlan.amount.toLocaleString()}`
            ) : (
              "Select a plan"
            )}
          </Button>
        </motion.div>
      </main>

      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handlePurchaseWithPin}
        title="Confirm Subscription"
        description="Enter your PIN to subscribe"
        amount={selectedPlan?.amount || 0}
        serviceName={`${selectedProvider?.name || provider} - ${selectedPlan?.name || ""}`}
      />
    </div>
  );
};

export default CableTV;
