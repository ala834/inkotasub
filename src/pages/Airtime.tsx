import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PhoneInputWithNetwork from "@/components/common/PhoneInputWithNetwork";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import TransactionConfirmationDialog from "@/components/common/TransactionConfirmationDialog";
import RecentNumbers from "@/components/common/RecentNumbers";
import { useRecentNumbers } from "@/hooks/useRecentNumbers";

const quickAmounts = [50, 100, 200, 500, 1000, 2000, 5000];

const Airtime = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [detectedNetwork, setDetectedNetwork] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [contactName, setContactName] = useState<string | undefined>();
  const { recentNumbers, addRecentNumber, clearRecentNumbers } = useRecentNumbers("airtime");

  const handleNetworkDetected = useCallback((network: string | null) => {
    setDetectedNetwork(network);
  }, []);

  const handleContactSelected = useCallback((name: string | undefined) => {
    setContactName(name);
  }, []);

  const validateForm = () => {
    if (!detectedNetwork || !phoneNumber || !amount) {
      toast.error("Please fill all fields");
      return false;
    }
    if (phoneNumber.length !== 11 && !phoneNumber.startsWith("+234")) {
      toast.error("Please enter a valid phone number");
      return false;
    }
    const amountNum = parseFloat(amount);
    if (wallet && amountNum > wallet.balance) {
      toast.error("Insufficient wallet balance");
      return false;
    }
    return true;
  };

  const handlePurchaseClick = () => {
    if (validateForm()) {
      setShowConfirmDialog(true);
    }
  };

  const handleConfirmPay = () => {
    setShowConfirmDialog(false);
    setShowPinDialog(true);
  };

  const handlePurchaseWithPin = async (pin: string) => {
    const amountNum = parseFloat(amount);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-airtime", {
        body: {
          network: detectedNetwork,
          phoneNumber,
          amount: amountNum,
          transaction_pin: pin,
        },
      });

      // Handle non-2xx responses from edge function
      if (error) {
        const errorMsg = error.message || "";
        if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
          throw new Error("Network error. Please check your internet connection and try again.");
        }
        // Try to parse error body for structured messages
        throw new Error(errorMsg || "Service unavailable. Please try again later.");
      }

      if (data?.success) {
        addRecentNumber(phoneNumber, contactName);
        toast.success("Airtime purchased successfully!");
        navigate("/dashboard");
      } else {
        // Map backend error messages to user-friendly ones
        const msg = data?.error || data?.message || "Purchase failed";
        if (msg.includes("Insufficient balance")) {
          throw new Error("Insufficient wallet balance. Please fund your wallet first.");
        } else if (msg.includes("Invalid transaction PIN") || msg.includes("Invalid PIN")) {
          throw new Error(data?.attemptsRemaining != null
            ? `Invalid PIN. ${data.attemptsRemaining} attempt(s) remaining.`
            : "Invalid PIN. Please try again.");
        } else if (msg.includes("locked")) {
          throw new Error("Account locked due to too many failed PIN attempts. Try again in 30 minutes.");
        } else if (msg.includes("PIN required")) {
          throw new Error("Transaction PIN is required to complete this payment.");
        } else {
          throw new Error(msg);
        }
      }
    } catch (error: any) {
      const message = error.message || "Failed to purchase airtime";
      // Show specific toast for non-PIN errors
      if (!message.includes("PIN") && !message.includes("locked")) {
        toast.error(message);
      }
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold">Buy Airtime</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Wallet Balance */}
          <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
              <p className="text-xl font-bold text-foreground">
                ₦{wallet?.balance.toLocaleString() || "0.00"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/fund-wallet")} className="rounded-xl">
              Fund Wallet
            </Button>
          </div>

          {/* Phone Number with Auto Network Detection */}
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
            onClick={handlePurchaseClick}
            disabled={isLoading || !detectedNetwork || !phoneNumber || !amount}
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

      <TransactionConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={handleConfirmPay}
        title="Confirm Airtime Purchase"
        amount={parseFloat(amount) || 0}
        walletBalanceAfter={(wallet?.balance || 0) - (parseFloat(amount) || 0)}
        details={[
          { label: "Service", value: "Airtime" },
          { label: "Network", value: detectedNetwork?.toUpperCase() || "" },
          { label: "Phone Number", value: phoneNumber },
        ]}
      />

      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handlePurchaseWithPin}
        title="Enter PIN"
        description="Enter your PIN to complete payment"
        amount={parseFloat(amount) || 0}
        serviceName={`${detectedNetwork?.toUpperCase()} Airtime`}
      />
    </div>
  );
};

export default Airtime;
