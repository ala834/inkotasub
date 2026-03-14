import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Wifi, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PhoneInputWithNetwork from "@/components/common/PhoneInputWithNetwork";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import TransactionConfirmationDialog from "@/components/common/TransactionConfirmationDialog";
import NetworkBadge from "@/components/common/NetworkBadge";
import RecentNumbers from "@/components/common/RecentNumbers";
import { useRecentNumbers } from "@/hooks/useRecentNumbers";
import { Skeleton } from "@/components/ui/skeleton";

interface DataPlan {
  id: string;
  name: string;
  amount: number;
  validity: string;
  category: string;
}

const CATEGORY_ORDER = ["SME", "SME2", "Corporate", "Gifting", "Direct", "General"];

const Data = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [detectedNetwork, setDetectedNetwork] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<DataPlan | null>(null);
  const [dataPlans, setDataPlans] = useState<DataPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [contactName, setContactName] = useState<string | undefined>();
  const { recentNumbers, addRecentNumber, clearRecentNumbers } = useRecentNumbers("data");

  const handleNetworkDetected = useCallback((network: string | null) => {
    if (network !== detectedNetwork) {
      setDetectedNetwork(network);
      setSelectedPlan(null);
      setActiveCategory(null);
      setSearchQuery("");
    }
  }, [detectedNetwork]);

  const handleContactSelected = useCallback((name: string | undefined) => {
    setContactName(name);
  }, []);

  useEffect(() => {
    if (detectedNetwork) {
      fetchDataPlans();
    } else {
      setDataPlans([]);
      setSelectedPlan(null);
    }
  }, [detectedNetwork]);

  const fetchDataPlans = async () => {
    if (!detectedNetwork) return;
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-data-plans", {
        body: { network: detectedNetwork },
      });
      if (error) throw error;
      if (data?.plans && data.plans.length > 0) {
        setDataPlans(data.plans);
        const categories = [...new Set(data.plans.map((p: DataPlan) => p.category))];
        const sorted = CATEGORY_ORDER.filter(c => categories.includes(c));
        if (sorted.length > 0) setActiveCategory(sorted[0]);
      } else {
        toast.error("No data plans available for this network");
        setDataPlans([]);
      }
    } catch (error) {
      console.error("Error fetching data plans:", error);
      toast.error("Failed to load data plans");
      setDataPlans([]);
    } finally {
      setLoadingPlans(false);
    }
  };

  const categories = useMemo(() => {
    const cats = [...new Set(dataPlans.map(p => p.category))];
    return CATEGORY_ORDER.filter(c => cats.includes(c));
  }, [dataPlans]);

  const filteredPlans = useMemo(() => {
    let plans = dataPlans;
    if (activeCategory) plans = plans.filter(p => p.category === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      plans = plans.filter(p =>
        p.name.toLowerCase().includes(q) || p.amount.toString().includes(q) || p.validity.toLowerCase().includes(q)
      );
    }
    return plans;
  }, [dataPlans, activeCategory, searchQuery]);

  const validateForm = () => {
    if (!detectedNetwork || !phoneNumber || !selectedPlan) {
      toast.error("Please fill all fields");
      return false;
    }
    if (phoneNumber.length !== 11 && !phoneNumber.startsWith("+234")) {
      toast.error("Please enter a valid phone number");
      return false;
    }
    if (wallet && selectedPlan.amount > wallet.balance) {
      toast.error("Insufficient wallet balance");
      return false;
    }
    return true;
  };

  const handlePurchaseClick = () => {
    if (validateForm()) setShowConfirmDialog(true);
  };

  const handleConfirmPay = () => {
    setShowConfirmDialog(false);
    setShowPinDialog(true);
  };

  const handlePurchaseWithPin = async (pin: string) => {
    if (!selectedPlan) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-data", {
        body: {
          network: detectedNetwork,
          phoneNumber,
          planId: selectedPlan.id,
          amount: selectedPlan.amount,
          transaction_pin: pin,
        },
      });
      if (error) throw error;
      if (data?.success) {
        addRecentNumber(phoneNumber, contactName);
        toast.success("Data bundle purchased successfully!");
        navigate("/dashboard");
      } else {
        throw new Error(data?.message || "Purchase failed");
      }
    } catch (error: any) {
      throw new Error(error.message || "Failed to purchase data");
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
          <h1 className="text-lg font-display font-bold">Buy Data</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
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

          {/* Phone Number */}
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <PhoneInputWithNetwork
              value={phoneNumber}
              onChange={setPhoneNumber}
              onNetworkDetected={handleNetworkDetected}
              onContactSelected={handleContactSelected}
            />
            <RecentNumbers
              numbers={recentNumbers}
              onSelect={setPhoneNumber}
              onClear={clearRecentNumbers}
            />
          </div>

          {/* Data Plans Section */}
          {detectedNetwork && (
            <div className="glass-card rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">{detectedNetwork.toUpperCase()} Data Plans</p>
                <span className="text-xs text-muted-foreground">{filteredPlans.length} plan{filteredPlans.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search plans..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 rounded-xl h-10 bg-background/50"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>

              {categories.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setSelectedPlan(null); }}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border",
                        activeCategory === cat
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background/50 text-muted-foreground border-border hover:border-primary/50"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {loadingPlans ? (
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                  ))}
                </div>
              ) : filteredPlans.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {searchQuery ? "No plans match your search" : "No plans available"}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
                  <AnimatePresence mode="popLayout">
                    {filteredPlans.map((plan) => (
                      <motion.button
                        key={plan.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        onClick={() => setSelectedPlan(plan)}
                        className={cn(
                          "p-3 rounded-xl border-2 transition-all text-left",
                          selectedPlan?.id === plan.id
                            ? "border-primary bg-primary/10 shadow-md"
                            : "border-border hover:border-primary/50 bg-background/30"
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Wifi className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span className="font-semibold text-sm leading-tight line-clamp-2">{plan.name}</span>
                        </div>
                        <p className="text-lg font-bold text-primary">₦{plan.amount.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{plan.validity}</p>
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handlePurchaseClick}
            disabled={isLoading || !detectedNetwork || !phoneNumber || !selectedPlan}
            className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : selectedPlan ? (
              `Buy ${selectedPlan.name} — ₦${selectedPlan.amount.toLocaleString()}`
            ) : (
              "Select a plan"
            )}
          </Button>
        </motion.div>
      </main>

      <TransactionConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={handleConfirmPay}
        title="Confirm Data Purchase"
        amount={selectedPlan?.amount || 0}
        walletBalanceAfter={(wallet?.balance || 0) - (selectedPlan?.amount || 0)}
        details={[
          { label: "Service", value: "Data Bundle" },
          { label: "Network", value: detectedNetwork?.toUpperCase() || "" },
          { label: "Phone Number", value: phoneNumber },
          { label: "Plan", value: selectedPlan?.name || "" },
          { label: "Validity", value: selectedPlan?.validity || "" },
        ]}
      />

      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handlePurchaseWithPin}
        title="Enter PIN"
        description="Enter your PIN to complete payment"
        amount={selectedPlan?.amount || 0}
        serviceName={`${detectedNetwork?.toUpperCase()} ${selectedPlan?.name} Data`}
      />
    </div>
  );
};

export default Data;
