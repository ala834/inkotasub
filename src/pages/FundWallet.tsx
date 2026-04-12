import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CreditCard, Building2, Wallet, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import VirtualAccountCard from "@/components/wallet/VirtualAccountCard";

const FundWallet = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank" | "ussd">("card");
  const [isLoading, setIsLoading] = useState(false);

  const quickAmounts = [1000, 2000, 5000, 10000, 20000, 50000];

  const handleFund = async () => {
    if (!user || !amount) {
      toast.error("Please enter an amount");
      return;
    }

    const amountNum = parseFloat(amount);
    if (amountNum < 100) {
      toast.error("Minimum amount is ₦100");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("initialize-payment", {
        body: {
          amount: amountNum,
          email: user.email,
          paymentMethod,
        },
      });

      if (error) throw error;

      if (data?.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        throw new Error("Failed to initialize payment");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to initialize payment");
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
          <h1 className="text-lg font-display font-bold">Fund Wallet</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Amount Input */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center">
                <Wallet className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Enter Amount</p>
                <p className="font-display font-bold text-lg">Fund Your Wallet</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₦)</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-14 text-2xl font-bold text-center rounded-xl"
              />
            </div>

            {/* Quick Amounts */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {quickAmounts.map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
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

          {/* Virtual Account Card */}
          <VirtualAccountCard />
          {/* Payment Method */}
          <div className="glass-card rounded-2xl p-4">
            <p className="text-muted-foreground text-sm mb-3">Payment Method</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setPaymentMethod("card")}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all",
                  paymentMethod === "card"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                )}
              >
                <CreditCard className={cn(
                  "h-5 w-5 mx-auto mb-1.5",
                  paymentMethod === "card" ? "text-primary" : "text-muted-foreground"
                )} />
                <p className={cn(
                  "text-xs font-medium",
                  paymentMethod === "card" ? "text-primary" : "text-muted-foreground"
                )}>
                  Card
                </p>
              </button>
              <button
                onClick={() => setPaymentMethod("bank")}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all",
                  paymentMethod === "bank"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                )}
              >
                <Building2 className={cn(
                  "h-5 w-5 mx-auto mb-1.5",
                  paymentMethod === "bank" ? "text-primary" : "text-muted-foreground"
                )} />
                <p className={cn(
                  "text-xs font-medium",
                  paymentMethod === "bank" ? "text-primary" : "text-muted-foreground"
                )}>
                  Bank Transfer
                </p>
              </button>
              <button
                onClick={() => setPaymentMethod("ussd")}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all",
                  paymentMethod === "ussd"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                )}
              >
                <Smartphone className={cn(
                  "h-5 w-5 mx-auto mb-1.5",
                  paymentMethod === "ussd" ? "text-primary" : "text-muted-foreground"
                )} />
                <p className={cn(
                  "text-xs font-medium",
                  paymentMethod === "ussd" ? "text-primary" : "text-muted-foreground"
                )}>
                  USSD
                </p>
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              {paymentMethod === "card" && "Pay securely with your debit/credit card"}
              {paymentMethod === "bank" && "Transfer from your bank app or internet banking"}
              {paymentMethod === "ussd" && "Pay using USSD code on any phone"}
            </p>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleFund}
            disabled={isLoading || !amount}
            className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-white" />
            ) : (
              `Pay ₦${parseFloat(amount || "0").toLocaleString()}`
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {parseFloat(amount || "0") > 0 && depositCharge > 0 && (
              <span className="block mb-1 text-destructive font-medium">
                A processing fee of ₦{depositCharge.toLocaleString()} will be deducted. You'll receive ₦{Math.max(0, parseFloat(amount || "0") - depositCharge).toLocaleString()}.
              </span>
            )}
            Powered by Paystack. Your payment is secure.
          </p>
        </motion.div>
      </main>
    </div>
  );
};

export default FundWallet;
