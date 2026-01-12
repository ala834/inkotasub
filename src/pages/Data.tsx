import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PhoneInputWithNetwork from "@/components/common/PhoneInputWithNetwork";

interface DataPlan {
  id: string;
  name: string;
  amount: number;
  validity: string;
}

const Data = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [detectedNetwork, setDetectedNetwork] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<DataPlan | null>(null);
  const [dataPlans, setDataPlans] = useState<DataPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);

  const handleNetworkDetected = useCallback((network: string | null) => {
    if (network !== detectedNetwork) {
      setDetectedNetwork(network);
      setSelectedPlan(null);
    }
  }, [detectedNetwork]);

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
    if (!detectedNetwork || !phoneNumber || !selectedPlan) {
      toast.error("Please fill all fields");
      return;
    }

    if (phoneNumber.length !== 11 && !phoneNumber.startsWith("+234")) {
      toast.error("Please enter a valid phone number");
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
          network: detectedNetwork,
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

          {/* Phone Number with Auto Network Detection */}
          <div className="glass-card rounded-2xl p-4">
            <PhoneInputWithNetwork
              value={phoneNumber}
              onChange={setPhoneNumber}
              onNetworkDetected={handleNetworkDetected}
            />
          </div>

          {/* Data Plans */}
          {detectedNetwork && (
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
            disabled={isLoading || !detectedNetwork || !phoneNumber || !selectedPlan}
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
