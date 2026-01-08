import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Phone, Loader2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import NetworkBadge from "@/components/common/NetworkBadge";

const networks = [
  { id: "mtn", name: "MTN", color: "bg-yellow-500" },
  { id: "airtel", name: "Airtel", color: "bg-red-500" },
  { id: "glo", name: "Glo", color: "bg-green-500" },
  { id: "9mobile", name: "9Mobile", color: "bg-green-700" },
];

interface DataPlan {
  id: string;
  name: string;
  amount: number;
  validity: string;
}

const Data = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { wallet } = useWallet();
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<DataPlan | null>(null);
  const [dataPlans, setDataPlans] = useState<DataPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);

  useEffect(() => {
    if (selectedNetwork) {
      fetchDataPlans();
    }
  }, [selectedNetwork]);

  const fetchDataPlans = async () => {
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-data-plans", {
        body: { network: selectedNetwork },
      });

      if (error) throw error;
      setDataPlans(data?.plans || getMockPlans());
    } catch (error) {
      setDataPlans(getMockPlans());
    } finally {
      setLoadingPlans(false);
    }
  };

  const getMockPlans = (): DataPlan[] => [
    { id: "1", name: "500MB", amount: 150, validity: "1 Day" },
    { id: "2", name: "1GB", amount: 300, validity: "1 Day" },
    { id: "3", name: "2GB", amount: 500, validity: "30 Days" },
    { id: "4", name: "3GB", amount: 800, validity: "30 Days" },
    { id: "5", name: "5GB", amount: 1200, validity: "30 Days" },
    { id: "6", name: "10GB", amount: 2500, validity: "30 Days" },
  ];

  const handlePurchase = async () => {
    if (!selectedNetwork || !phoneNumber || !selectedPlan) {
      toast.error("Please fill all fields");
      return;
    }

    if (phoneNumber.length !== 11) {
      toast.error("Please enter a valid 11-digit phone number");
      return;
    }

    if (wallet && selectedPlan.amount > wallet.balance) {
      toast.error("Insufficient wallet balance");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-data", {
        body: {
          network: selectedNetwork,
          phoneNumber,
          planId: selectedPlan.id,
          amount: selectedPlan.amount,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Data bundle purchased successfully!");
        navigate("/dashboard");
      } else {
        throw new Error(data?.message || "Purchase failed");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to purchase data");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero pb-6">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold">Buy Data</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Wallet Balance */}
          <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
              <p className="text-xl font-bold text-foreground">
                ₦{wallet?.balance.toLocaleString() || "0.00"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/fund-wallet")}
              className="rounded-xl"
            >
              Fund Wallet
            </Button>
          </div>

          {/* Network Selection */}
          <div className="glass-card rounded-2xl p-4">
            <Label className="text-muted-foreground mb-3 block">Select Network</Label>
            <div className="grid grid-cols-4 gap-3">
              {networks.map((net) => (
                <button
                  key={net.id}
                  onClick={() => {
                    setSelectedNetwork(net.id);
                    setSelectedPlan(null);
                  }}
                  className={cn(
                    "p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2",
                    selectedNetwork === net.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <NetworkBadge network={net.id as "mtn" | "airtel" | "glo" | "9mobile"} size="lg" />
                  <span className="text-xs font-medium">{net.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Phone Number */}
          <div className="glass-card rounded-2xl p-4">
            <Label htmlFor="phone">Phone Number</Label>
            <div className="relative mt-2">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="08012345678"
                className="pl-10 h-12 rounded-xl"
              />
            </div>
          </div>

          {/* Data Plans */}
          {selectedNetwork && (
            <div className="glass-card rounded-2xl p-4">
              <Label className="text-muted-foreground mb-3 block">Select Data Plan</Label>
              {loadingPlans ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {dataPlans.map((plan) => (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all text-left",
                        selectedPlan?.id === plan.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Wifi className="h-4 w-4 text-primary" />
                        <span className="font-semibold">{plan.name}</span>
                      </div>
                      <p className="text-lg font-bold text-primary">
                        ₦{plan.amount.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">{plan.validity}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handlePurchase}
            disabled={isLoading || !selectedNetwork || !phoneNumber || !selectedPlan}
            className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : selectedPlan ? (
              `Buy ${selectedPlan.name} for ₦${selectedPlan.amount.toLocaleString()}`
            ) : (
              "Select a plan"
            )}
          </Button>
        </motion.div>
      </main>
    </div>
  );
};

export default Data;
