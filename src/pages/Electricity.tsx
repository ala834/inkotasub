import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Zap, Loader2, CheckCircle, ChevronDown, CreditCard, ChevronRight, Users } from "lucide-react";
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

const DISCOS = [
  { id: "ikeja", name: "Ikeja Electric", code: "IE" },
  { id: "eko", name: "Eko Electric", code: "EKEDC" },
  { id: "abuja", name: "Abuja Electric", code: "AEDC" },
  { id: "kano", name: "Kano Electric", code: "KEDCO" },
  { id: "portharcourt", name: "Port Harcourt Electric", code: "PHED" },
  { id: "ibadan", name: "Ibadan Electric", code: "IBEDC" },
  { id: "kaduna", name: "Kaduna Electric", code: "KAEDCO" },
  { id: "jos", name: "Jos Electric", code: "JED" },
  { id: "enugu", name: "Enugu Electric", code: "EEDC" },
  { id: "benin", name: "Benin Electric", code: "BEDC" },
];

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000];

const Electricity = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [disco, setDisco] = useState("");
  const [showDiscoList, setShowDiscoList] = useState(false);
  const [meterType, setMeterType] = useState<"prepaid" | "postpaid">("prepaid");
  const [meterNumber, setMeterNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [isValidated, setIsValidated] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultSuccess, setResultSuccess] = useState(false);
  const [resultTransactionId, setResultTransactionId] = useState("");
  const [resultError, setResultError] = useState("");
  const [resultToken, setResultToken] = useState("");
  const [showBeneficiaries, setShowBeneficiaries] = useState(false);
  const { recentNumbers, addRecentNumber, clearRecentNumbers } = useRecentNumbers("electricity");
  const { beneficiaries, addBeneficiary, removeBeneficiary } = useBeneficiaries("electricity");

  const amountNum = parseFloat(amount || "0");
  const selectedDisco = DISCOS.find(d => d.id === disco);

  const handleValidate = async () => {
    if (!disco || !meterNumber) {
      toast.error("Please select disco and enter meter number");
      return;
    }
    setIsValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-meter", {
        body: { disco, meterNumber, meterType },
      });
      if (error) throw error;
      if (data?.customerName) {
        setCustomerName(data.customerName);
        setIsValidated(true);
        toast.success("Meter validated successfully!");
      } else {
        throw new Error("Invalid meter number");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to validate meter");
      setIsValidated(false);
      setCustomerName("");
    } finally {
      setIsValidating(false);
    }
  };

  const validateForm = () => {
    if (!isValidated || !amount) {
      toast.error("Please validate meter and enter amount");
      return false;
    }
    if (amountNum < 500) {
      toast.error("Minimum electricity purchase is ₦500");
      return false;
    }
    if (wallet && amountNum > wallet.balance) {
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
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-electricity", {
        body: {
          disco,
          meterNumber,
          meterType,
          amount: amountNum,
          customerName,
          transaction_pin: pin,
        },
      });
      if (error || !data?.success) {
        const message = parseEdgeFunctionError(error, data, "Failed to purchase electricity");
        setResultSuccess(false);
        setResultError(message);
        setResultTransactionId("");
        setResultToken("");
        setShowResult(true);
        if (!message.includes("PIN") && !message.includes("locked")) toast.error(message);
        throw new Error(message);
      }
      addRecentNumber(meterNumber, customerName || undefined);
      addBeneficiary(meterNumber, customerName || undefined);
      setResultSuccess(true);
      setResultTransactionId(data.reference || data.transactionId || "");
      setResultToken(data.token || "");
      setResultError("");
      setShowResult(true);
    } catch (error: any) {
      throw new Error(error.message || "Failed to purchase electricity");
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
        <h1 className="text-lg font-bold text-white">Electricity</h1>
        <div className="w-10" />
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

        {/* Disco Selection */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3"
        >
          <p className="text-sm font-semibold text-gray-700">Distribution Company</p>
          <button
            onClick={() => setShowDiscoList(!showDiscoList)}
            className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between text-base transition-all focus:ring-2 focus:ring-green-500"
          >
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-yellow-500" />
              <span className={selectedDisco ? "text-gray-900" : "text-gray-400"}>
                {selectedDisco ? selectedDisco.name : "Select disco"}
              </span>
            </div>
            <ChevronDown className={cn("h-5 w-5 text-gray-400 transition-transform", showDiscoList && "rotate-180")} />
          </button>

          {showDiscoList && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white"
            >
              {DISCOS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { setDisco(d.id); setShowDiscoList(false); setIsValidated(false); setCustomerName(""); }}
                  className={cn(
                    "w-full px-4 py-3 flex items-center justify-between text-left border-b border-gray-50 last:border-0 transition-colors",
                    disco === d.id ? "bg-green-50" : "hover:bg-gray-50 active:bg-gray-100"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center">
                      <Zap className="h-4 w-4 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{d.name}</p>
                      <p className="text-xs text-gray-500">{d.code}</p>
                    </div>
                  </div>
                  {disco === d.id && <CheckCircle className="h-5 w-5 text-green-500" />}
                </button>
              ))}
            </motion.div>
          )}
        </motion.div>

        {/* Meter Type */}
        {disco && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3"
          >
            <p className="text-sm font-semibold text-gray-700">Meter Type</p>
            <div className="grid grid-cols-2 gap-3">
              {(["prepaid", "postpaid"] as const).map((type) => (
                <motion.button
                  key={type}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setMeterType(type); setIsValidated(false); setCustomerName(""); }}
                  className={cn(
                    "px-4 py-3 rounded-xl text-sm font-semibold capitalize transition-all border-2",
                    meterType === type
                      ? "bg-green-500 text-white border-green-500 shadow-md shadow-green-500/25"
                      : "bg-white text-gray-600 border-gray-100 active:bg-gray-50"
                  )}
                >
                  {type}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Meter Number */}
        {disco && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3"
          >
            <p className="text-sm font-semibold text-gray-700">Meter Number</p>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                inputMode="numeric"
                value={meterNumber}
                onChange={(e) => { setMeterNumber(e.target.value); setIsValidated(false); setCustomerName(""); }}
                placeholder="Enter meter number"
                className="w-full h-12 pl-11 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-base"
              />
            </div>

            {recentNumbers.length > 0 && (
              <button
                onClick={() => {
                  if (recentNumbers[0]) {
                    setMeterNumber(recentNumbers[0].number);
                    setIsValidated(false);
                  }
                }}
                className="flex items-center gap-2 w-full px-3 py-2.5 bg-green-50 rounded-xl text-green-700 text-sm font-medium active:bg-green-100 transition-colors"
              >
                <CreditCard className="h-4 w-4" />
                <span>View Saved Meters</span>
                <ChevronRight className="h-4 w-4 ml-auto" />
              </button>
            )}

            {/* Validate Button */}
            <button
              onClick={handleValidate}
              disabled={isValidating || !meterNumber}
              className={cn(
                "w-full h-12 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2",
                isValidated
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-gray-100 text-gray-700 active:bg-gray-200 border border-gray-200",
                (isValidating || !meterNumber) && "opacity-50 cursor-not-allowed"
              )}
            >
              {isValidating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isValidated ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span>Verified: {customerName}</span>
                </>
              ) : (
                "Validate Meter"
              )}
            </button>
          </motion.div>
        )}

        {/* Amount */}
        {isValidated && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4"
          >
            <p className="text-sm font-semibold text-gray-700">Amount (₦)</p>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount (min ₦500)"
              className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-base"
            />
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((amt) => (
                <motion.button
                  key={amt}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => setAmount(amt.toString())}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-semibold transition-all border-2",
                    amount === amt.toString()
                      ? "border-green-500 bg-green-50 text-green-700 shadow-md shadow-green-500/15"
                      : "border-gray-100 bg-white text-gray-600 active:bg-gray-50"
                  )}
                >
                  ₦{amt.toLocaleString()}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </main>

      {/* Sticky Buy Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-gray-200 z-50">
        <div className="max-w-lg mx-auto">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handlePurchaseClick}
            disabled={isLoading || !isValidated || !amount}
            className={cn(
              "w-full h-14 rounded-2xl font-bold text-base transition-all shadow-lg flex items-center justify-center gap-2",
              amountNum >= 500 && isValidated
                ? "bg-gradient-to-r from-green-600 to-green-500 text-white shadow-green-500/30 active:from-green-700 active:to-green-600"
                : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : amountNum > 0 ? (
              `Pay ₦${amountNum.toLocaleString()}`
            ) : (
              "Enter amount"
            )}
          </motion.button>
        </div>
      </div>

      {/* Dialogs */}
      <TransactionConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={handleConfirmPay}
        title="Confirm Electricity Payment"
        amount={amountNum}
        walletBalanceAfter={(wallet?.balance || 0) - amountNum}
        details={[
          { label: "Service", value: "Electricity" },
          { label: "Provider", value: selectedDisco?.name || disco },
          { label: "Meter Type", value: meterType.charAt(0).toUpperCase() + meterType.slice(1) },
          { label: "Meter Number", value: meterNumber },
          { label: "Customer", value: customerName },
        ]}
      />

      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handlePurchaseWithPin}
        title="Enter PIN"
        description="Enter your PIN to complete payment"
        amount={amountNum}
        serviceName={`${selectedDisco?.name || disco} - ${meterType}`}
      />

      <TransactionResultScreen
        open={showResult}
        onClose={() => setShowResult(false)}
        success={resultSuccess}
        amount={amountNum}
        details={[
          { label: "Service", value: "Electricity" },
          { label: "Provider", value: selectedDisco?.name || disco },
          { label: "Meter Type", value: meterType.charAt(0).toUpperCase() + meterType.slice(1) },
          { label: "Meter Number", value: meterNumber },
          { label: "Customer", value: customerName },
          ...(resultToken ? [{ label: "Token", value: resultToken }] : []),
        ]}
        transactionId={resultTransactionId}
        errorMessage={resultError}
      />
    </div>
  );
};

export default Electricity;
