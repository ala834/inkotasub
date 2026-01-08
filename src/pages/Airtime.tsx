import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Phone, Loader2 } from "lucide-react";
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

const quickAmounts = [50, 100, 200, 500, 1000, 2000, 5000];

const Airtime = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { wallet } = useWallet();
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handlePurchase = async () => {
    if (!selectedNetwork || !phoneNumber || !amount) {
      toast.error("Please fill all fields");
      return;
    }

    if (phoneNumber.length !== 11) {
      toast.error("Please enter a valid 11-digit phone number");
      return;
    }

    const amountNum = parseFloat(amount);
    if (wallet && amountNum > wallet.balance) {
      toast.error("Insufficient wallet balance");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-airtime", {
        body: {
          network: selectedNetwork,
          phoneNumber,
          amount: amountNum,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Airtime purchased successfully!");
        navigate("/dashboard");
      } else {
        throw new Error(data?.message || "Purchase failed");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to purchase airtime");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero">
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
          <h1 className="text-lg font-display font-bold">Buy Airtime</h1>
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
                  onClick={() => setSelectedNetwork(net.id)}
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

          {/* Amount */}
          <div className="glass-card rounded-2xl p-4">
            <Label htmlFor="amount">Amount (₦)</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="h-12 rounded-xl mt-2"
            />

            <div className="flex flex-wrap gap-2 mt-3">
              {quickAmounts.map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(amt.toString())}
                  className={cn(
                    "rounded-xl",
                    amount === amt.toString() && "border-primary bg-primary/10"
                  )}
                >
                  ₦{amt.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handlePurchase}
            disabled={isLoading || !selectedNetwork || !phoneNumber || !amount}
            className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              `Buy ₦${parseFloat(amount || "0").toLocaleString()} Airtime`
            )}
          </Button>
        </motion.div>
      </main>
    </div>
  );
};

export default Airtime;
