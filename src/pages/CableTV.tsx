import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Check, CreditCard, ChevronRight, RefreshCw, CheckCircle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseEdgeFunctionError } from "@/lib/edge-function-errors";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import TransactionConfirmationDialog from "@/components/common/TransactionConfirmationDialog";
import TransactionResultScreen from "@/components/common/TransactionResultScreen";
import { useRecentNumbers } from "@/hooks/useRecentNumbers";
import { useBeneficiaries } from "@/hooks/useBeneficiaries";
import BeneficiariesDialog from "@/components/common/BeneficiariesDialog";

import dstvLogo from "@/assets/providers/dstv.png";
import gotvLogo from "@/assets/providers/gotv.png";
import startimesLogo from "@/assets/providers/startimes.png";

const PROVIDERS = [
  { id: "dstv", name: "DSTV", logo: dstvLogo },
  { id: "gotv", name: "GOtv", logo: gotvLogo },
  { id: "startimes", name: "StarTimes", logo: startimesLogo },
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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultSuccess, setResultSuccess] = useState(false);
  const [resultTransactionId, setResultTransactionId] = useState("");
  const [resultError, setResultError] = useState("");
  const [showBeneficiaries, setShowBeneficiaries] = useState(false);
  const { recentNumbers, addRecentNumber, clearRecentNumbers } = useRecentNumbers("cable");
  const { beneficiaries, addBeneficiary, removeBeneficiary } = useBeneficiaries("cable");

  useEffect(() => {
    if (provider) fetchPlans();
  }, [provider]);

  const fetchPlans = async (forceRefresh = false) => {
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-cable-plans", {
        body: { provider, forceRefresh },
      });
      if (error) throw error;
      setPlans(data?.plans || getMockPlans());
    } catch {
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
      if (data?.validated && data?.customerName) {
        setCustomerName(data.customerName);
        setIsValidated(true);
        toast.success("Smart card validated successfully!");
      } else {
        toast.error(data?.error || "Invalid smart card number");
        setIsValidated(false);
        setCustomerName("");
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
      if (error || !data?.success) {
        const message = parseEdgeFunctionError(error, data, "Failed to subscribe");
        setResultSuccess(false);
        setResultError(message);
        setResultTransactionId("");
        setShowResult(true);
        if (!message.includes("PIN") && !message.includes("locked")) toast.error(message);
        throw new Error(message);
      }
      addRecentNumber(smartCardNumber, customerName || undefined);
      addBeneficiary(smartCardNumber, customerName || undefined);
      setResultSuccess(true);
      setResultTransactionId(data.reference || data.transactionId || "");
      setResultError("");
      setShowResult(true);
    } catch (error: any) {
      throw new Error(error.message || "Failed to subscribe");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedProvider = PROVIDERS.find(p => p.id === provider);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Green Header */}
      <header className="bg-gradient-to-r from-green-600 to-green-500 px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Cable TV</h1>
        <button
          onClick={() => fetchPlans(true)}
          disabled={loadingPlans}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors"
        >
          <RefreshCw className={cn("h-5 w-5 text-white", loadingPlans && "animate-spin")} />
        </button>
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto space-y-5">
        {/* Wallet Balance */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between"
        >
          <div>
            <p className="text-xs text-gray-500 font-medium">Wallet Balance</p>
            <p className="text-xl font-bold text-gray-900">₦{wallet?.balance.toLocaleString() || "0.00"}</p>
          </div>
          <button
            onClick={() => navigate("/fund-wallet")}
            className="px-4 py-2 bg-green-50 text-green-600 font-semibold text-sm rounded-xl border border-green-200 active:bg-green-100 transition-colors"
          >
            Fund Wallet
          </button>
        </motion.div>

        {/* Provider Selection */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
        >
          <p className="text-sm font-semibold text-gray-700 mb-3">Select Provider</p>
          <div className="grid grid-cols-3 gap-3">
            {PROVIDERS.map((p) => (
              <motion.button
                key={p.id}
                whileTap={{ scale: 0.93 }}
                onClick={() => { setProvider(p.id); setSelectedPlan(null); setIsValidated(false); setCustomerName(""); }}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                  provider === p.id
                    ? "border-green-500 shadow-lg shadow-green-500/20 bg-green-50/50"
                    : "border-gray-100 bg-white hover:border-gray-200"
                )}
              >
                <img src={p.logo} alt={p.name} className="w-12 h-12 rounded-2xl object-contain shadow-sm" />
                <span className={cn(
                  "text-xs font-medium",
                  provider === p.id ? "text-green-600" : "text-gray-500"
                )}>
                  {p.name}
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Smart Card Number */}
        {provider && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3"
          >
            <p className="text-sm font-semibold text-gray-700">Smart Card / IUC Number</p>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                inputMode="numeric"
                value={smartCardNumber}
                onChange={(e) => { setSmartCardNumber(e.target.value); setIsValidated(false); setCustomerName(""); }}
                placeholder="Enter smart card number"
                className="w-full h-12 pl-11 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-base"
              />
            </div>

            {/* Recent numbers */}
            {recentNumbers.length > 0 && (
              <button
                onClick={() => {
                  if (recentNumbers[0]) {
                    setSmartCardNumber(recentNumbers[0].number);
                    setIsValidated(false);
                  }
                }}
                className="flex items-center gap-2 w-full px-3 py-2.5 bg-green-50 rounded-xl text-green-700 text-sm font-medium active:bg-green-100 transition-colors"
              >
                <CreditCard className="h-4 w-4" />
                <span>View Beneficiaries</span>
                <ChevronRight className="h-4 w-4 ml-auto" />
              </button>
            )}

            {/* Validate Button */}
            <button
              onClick={handleValidate}
              disabled={isValidating || !smartCardNumber}
              className={cn(
                "w-full h-12 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2",
                isValidated
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-200",
                (isValidating || !smartCardNumber) && "opacity-50 cursor-not-allowed"
              )}
            >
              {isValidating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isValidated ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span>{customerName}</span>
                </>
              ) : (
                "Validate Smart Card"
              )}
            </button>
          </motion.div>
        )}

        {/* Cable Plans */}
        {isValidated && plans.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4"
          >
            <p className="text-sm font-semibold text-gray-700">Select Plan</p>

            {loadingPlans ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-0.5">
                <AnimatePresence mode="popLayout">
                  {plans.map((plan) => {
                    const isSelected = selectedPlan?.id === plan.id;
                    return (
                      <motion.button
                        key={plan.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        onClick={() => setSelectedPlan(plan)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left",
                          isSelected
                            ? "border-green-500 bg-green-50/70 shadow-md shadow-green-500/10"
                            : "border-gray-100 bg-white hover:border-gray-200 active:bg-gray-50"
                        )}
                      >
                        <img
                          src={selectedProvider?.logo}
                          alt={selectedProvider?.name}
                          className="w-10 h-10 rounded-xl object-contain flex-shrink-0 shadow-sm"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{plan.name}</p>
                          <p className="text-xs text-gray-500">30 days</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-base font-bold text-gray-900">₦{plan.amount.toLocaleString()}</span>
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"
                            >
                              <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                            </motion.div>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* Sticky Buy Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-gray-200 z-50">
        <div className="max-w-lg mx-auto">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handlePurchaseClick}
            disabled={isLoading || !isValidated || !selectedPlan}
            className={cn(
              "w-full h-14 rounded-2xl font-bold text-base transition-all shadow-lg flex items-center justify-center gap-2",
              selectedPlan && isValidated
                ? "bg-gradient-to-r from-green-600 to-green-500 text-white shadow-green-500/30 active:from-green-700 active:to-green-600"
                : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : selectedPlan ? (
              `Pay ₦${selectedPlan.amount.toLocaleString()}`
            ) : (
              "Select a plan"
            )}
          </motion.button>
        </div>
      </div>

      {/* Dialogs */}
      <TransactionConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={handleConfirmPay}
        title="Confirm Cable Subscription"
        amount={selectedPlan?.amount || 0}
        walletBalanceAfter={(wallet?.balance || 0) - (selectedPlan?.amount || 0)}
        details={[
          { label: "Service", value: "Cable TV" },
          { label: "Provider", value: selectedProvider?.name || provider },
          { label: "Smart Card", value: smartCardNumber },
          { label: "Customer", value: customerName },
          { label: "Plan", value: selectedPlan?.name || "" },
        ]}
      />

      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handlePurchaseWithPin}
        title="Enter PIN"
        description="Enter your PIN to complete payment"
        amount={selectedPlan?.amount || 0}
        serviceName={`${selectedProvider?.name || provider} - ${selectedPlan?.name || ""}`}
      />

      <TransactionResultScreen
        open={showResult}
        onClose={() => setShowResult(false)}
        success={resultSuccess}
        amount={selectedPlan?.amount || 0}
        details={[
          { label: "Service", value: "Cable TV" },
          { label: "Provider", value: selectedProvider?.name || provider },
          { label: "Smart Card", value: smartCardNumber },
          { label: "Customer", value: customerName },
          { label: "Plan", value: selectedPlan?.name || "" },
        ]}
        transactionId={resultTransactionId}
        errorMessage={resultError}
      />
    </div>
  );
};

export default CableTV;
