import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CreditCard, Building2, Smartphone, Loader2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import VirtualAccountCard from "@/components/wallet/VirtualAccountCard";

const quickAmounts = [1000, 2000, 5000, 10000, 20000, 50000];

const paymentMethods = [
  { id: "card" as const, label: "Card", icon: CreditCard, desc: "Pay with debit/credit card" },
  { id: "bank" as const, label: "Bank Transfer", icon: Building2, desc: "Transfer from your bank" },
  { id: "ussd" as const, label: "USSD", icon: Smartphone, desc: "Pay via USSD code" },
];

const FundWallet = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { wallet } = useWallet();
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank" | "ussd">("card");
  const [isLoading, setIsLoading] = useState(false);
  const { settings } = useAppSettings();
  const depositCharge = parseFloat(settings.deposit_charge_amount || "25") || 0;

  const amountNum = parseFloat(amount || "0");

  const handleFund = async () => {
    if (!user || !amount) { toast.error("Please enter an amount"); return; }
    if (amountNum < 100) { toast.error("Minimum amount is ₦100"); return; }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("initialize-payment", {
        body: { amount: amountNum, email: user.email, paymentMethod },
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
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Green Header */}
      <header className="bg-gradient-to-r from-green-600 to-green-500 px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Fund Wallet</h1>
        <div className="w-10" />
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto space-y-5">
        {/* Wallet Balance */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">Wallet Balance</p>
            <p className="text-xl font-bold text-gray-900">₦{wallet?.balance.toLocaleString() || "0.00"}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-green-600" />
          </div>
        </motion.div>

        {/* Amount Input */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Enter Amount</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400">₦</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full h-16 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-center"
            />
          </div>

          {/* Quick Amounts */}
          <div className="grid grid-cols-3 gap-2">
            {quickAmounts.map(amt => (
              <motion.button
                key={amt}
                whileTap={{ scale: 0.95 }}
                onClick={() => setAmount(amt.toString())}
                className={cn(
                  "h-11 rounded-xl border-2 text-sm font-bold transition-all",
                  amount === amt.toString()
                    ? "border-green-500 bg-green-50 text-green-600 shadow-md shadow-green-500/10"
                    : "border-gray-100 bg-white text-gray-700 hover:border-gray-200"
                )}
              >
                ₦{amt.toLocaleString()}
              </motion.button>
            ))}
          </div>

          {amountNum > 0 && depositCharge > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-amber-700">Processing fee</span>
                <span className="font-medium text-amber-800">₦{depositCharge.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-amber-700">You'll receive</span>
                <span className="text-green-600">₦{Math.max(0, amountNum - depositCharge).toLocaleString()}</span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Virtual Account */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <VirtualAccountCard />
        </motion.div>

        {/* Payment Method */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">Payment Method</p>
          <div className="grid grid-cols-3 gap-2">
            {paymentMethods.map(method => {
              const Icon = method.icon;
              const isActive = paymentMethod === method.id;
              return (
                <motion.button
                  key={method.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setPaymentMethod(method.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all",
                    isActive
                      ? "border-green-500 bg-green-50/50 shadow-md shadow-green-500/10"
                      : "border-gray-100 bg-white hover:border-gray-200"
                  )}
                >
                  <Icon className={cn("h-5 w-5", isActive ? "text-green-600" : "text-gray-400")} />
                  <span className={cn("text-xs font-medium", isActive ? "text-green-600" : "text-gray-500")}>
                    {method.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3 text-center">
            {paymentMethods.find(m => m.id === paymentMethod)?.desc}
          </p>
        </motion.div>
      </main>

      {/* Sticky Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] z-40">
        <div className="max-w-lg mx-auto space-y-2">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleFund}
            disabled={isLoading || !amount || amountNum < 100}
            className={cn(
              "w-full h-14 rounded-2xl font-bold text-lg transition-all shadow-lg",
              amount && amountNum >= 100
                ? "bg-gradient-to-r from-green-600 to-green-500 text-white active:from-green-700 active:to-green-600 shadow-green-500/25"
                : "bg-gray-200 text-gray-400"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            ) : amountNum >= 100 ? (
              `Pay ₦${amountNum.toLocaleString()}`
            ) : (
              "Enter amount (min ₦100)"
            )}
          </motion.button>
          <p className="text-xs text-gray-400 text-center">Powered by Paystack • Secure payment</p>
        </div>
      </div>
    </div>
  );
};

export default FundWallet;
