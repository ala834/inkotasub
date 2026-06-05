import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Phone, Contact, ChevronRight, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseEdgeFunctionError, isPendingTransaction } from "@/lib/edge-function-errors";
import { detectNetwork } from "@/hooks/useNetworkDetection";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import TransactionConfirmationDialog from "@/components/common/TransactionConfirmationDialog";
import TransactionResultScreen from "@/components/common/TransactionResultScreen";
import BeneficiariesDialog from "@/components/common/BeneficiariesDialog";
import { useRecentNumbers } from "@/hooks/useRecentNumbers";
import { useBeneficiaries } from "@/hooks/useBeneficiaries";
import { useCashbackCheckout } from "@/hooks/useCashbackCheckout";

import { NETWORKS } from "@/components/common/NetworkLogos";
import OfflineServiceGuard from "@/components/common/OfflineServiceGuard";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000, 5000];

const Airtime = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [contactName, setContactName] = useState<string | undefined>();
  const [showResult, setShowResult] = useState(false);
  const [resultSuccess, setResultSuccess] = useState(false);
  const [resultPending, setResultPending] = useState(false);
  const [resultError, setResultError] = useState("");
  const [resultTransactionId, setResultTransactionId] = useState<string | undefined>();
  const [showBeneficiaries, setShowBeneficiaries] = useState(false);
  const { recentNumbers, addRecentNumber, clearRecentNumbers } = useRecentNumbers("airtime");
  const { beneficiaries, addBeneficiary, removeBeneficiary } = useBeneficiaries("airtime");

  // Auto-detect network from phone input
  useEffect(() => {
    if (phoneNumber.length >= 4) {
      const detected = detectNetwork(phoneNumber);
      if (detected && detected !== selectedNetwork) {
        setSelectedNetwork(detected);
      }
    }
  }, [phoneNumber]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^\d+]/g, "");
    if (cleaned.length <= 14) setPhoneNumber(cleaned);
  };

  const handlePickContact = async () => {
    try {
      const contacts = await (navigator as any).contacts.select(["name", "tel"], { multiple: false });
      if (contacts?.[0]) {
        let num = contacts[0].tel?.[0]?.replace(/[\s\-()]/g, "") || "";
        if (num.startsWith("+234")) num = "0" + num.slice(4);
        setPhoneNumber(num);
        setContactName(contacts[0].name?.[0]);
      }
    } catch {
      // User cancelled
    }
  };

  const handleNetworkSelect = (networkId: string) => {
    setSelectedNetwork(networkId);
  };

  const amountNum = parseFloat(amount || "0");
  const cashback = useCashbackCheckout("airtime", amountNum);

  const validateForm = () => {
    if (!selectedNetwork || !phoneNumber || !amount) {
      toast.error("Please fill all fields");
      return false;
    }
    if (phoneNumber.length !== 11 && !phoneNumber.startsWith("+234")) {
      toast.error("Please enter a valid phone number");
      return false;
    }
    if (amountNum < 50) {
      toast.error("Minimum airtime top-up is ₦50");
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

  const handleConfirmPay = async () => {
    setShowConfirmDialog(false);
    const ok = await cashback.redeemIfNeeded();
    if (!ok) return;
    setShowPinDialog(true);
  };

  const handlePurchaseWithPin = async (pin: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-airtime", {
        body: {
          network: selectedNetwork,
          phoneNumber,
          amount: amountNum,
          transaction_pin: pin,
        },
      });

      // Pending (indeterminate) — show Processing UI, do not throw
      if (!error && data && !data.success && isPendingTransaction(data)) {
        setResultSuccess(false);
        setResultPending(true);
        setResultError(data.message || "Processing... Your transaction is being confirmed.");
        setResultTransactionId(data?.reference);
        setShowResult(true);
        return;
      }

      if (error || !data?.success) {
        const message = parseEdgeFunctionError(error, data, "Failed to purchase airtime");
        if (!message.includes("PIN") && !message.includes("locked")) {
          setResultSuccess(false);
          setResultPending(false);
          setResultError(message);
          setResultTransactionId(data?.reference);
          setShowResult(true);
        }
        throw new Error(message);
      }

      addRecentNumber(phoneNumber, contactName);
      addBeneficiary(phoneNumber, contactName, selectedNetwork || undefined);
      setResultSuccess(true);
      setResultPending(false);
      setResultError("");
      setResultTransactionId(data?.reference || data?.transactionId);
      setShowResult(true);
    } catch (error: any) {
      throw new Error(error.message || "Failed to purchase airtime");
    } finally {
      setIsLoading(false);
    }
  };

  const contactSupported = typeof window !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

  const __isOnline = useOnlineStatus();
  if (!__isOnline) return <OfflineServiceGuard title="Airtime" />;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Green Header */}
      <header className="bg-gradient-to-r from-green-600 to-green-500 px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Buy Airtime</h1>
        <div className="w-10" />
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto space-y-5">
        {/* Wallet Balance Card */}
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

        {/* Network Selection */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
        >
          <p className="text-sm font-semibold text-gray-700 mb-3">Select Network</p>
          <div className="grid grid-cols-4 gap-3">
            {NETWORKS.map((net) => (
              <motion.button
                key={net.id}
                whileTap={{ scale: 0.93 }}
                onClick={() => handleNetworkSelect(net.id)}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                  selectedNetwork === net.id
                    ? "border-green-500 shadow-lg shadow-green-500/20 bg-green-50/50"
                    : "border-gray-100 bg-white hover:border-gray-200"
                )}
              >
                <img
                  src={net.logo}
                  alt={net.name}
                  className="w-12 h-12 rounded-2xl object-contain shadow-sm"
                />
                <span className={cn(
                  "text-xs font-medium",
                  selectedNetwork === net.id ? "text-green-600" : "text-gray-500"
                )}>
                  {net.name}
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Phone Number Input */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3"
        >
          <p className="text-sm font-semibold text-gray-700">Phone Number</p>
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="tel"
                inputMode="numeric"
                value={phoneNumber}
                onChange={handlePhoneChange}
                placeholder="080XXXXXXXX"
                className="w-full h-12 pl-11 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-base"
              />
            </div>
            {contactSupported && (
              <button
                onClick={handlePickContact}
                className="flex-shrink-0 w-12 h-12 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors active:bg-gray-200"
              >
                <Contact className="h-5 w-5 text-green-600" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowBeneficiaries(true)}
            className="flex items-center gap-2 w-full px-3 py-2.5 bg-green-50 rounded-xl text-green-700 text-sm font-medium active:bg-green-100 transition-colors"
          >
            <Users className="h-4 w-4" />
            <span>View Beneficiaries ({beneficiaries.length})</span>
            <ChevronRight className="h-4 w-4 ml-auto" />
          </button>
        </motion.div>

        {/* Amount Selection */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4"
        >
          <p className="text-sm font-semibold text-gray-700">Amount (₦)</p>
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
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
      </main>

      {/* Sticky Buy Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-gray-200 z-50">
        <div className="max-w-lg mx-auto">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handlePurchaseClick}
            disabled={isLoading || !selectedNetwork || !phoneNumber || !amount}
            className={cn(
              "w-full h-14 rounded-2xl font-bold text-base transition-all shadow-lg flex items-center justify-center gap-2",
              amountNum > 0 && selectedNetwork && phoneNumber
                ? "bg-gradient-to-r from-green-600 to-green-500 text-white shadow-green-500/30 active:from-green-700 active:to-green-600"
                : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : amountNum > 0 ? (
              `Buy ₦${amountNum.toLocaleString()} Airtime`
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
        title="Confirm Airtime Purchase"
        amount={amountNum}
        walletBalanceAfter={(wallet?.balance || 0) - amountNum}
        details={[
          { label: "Service", value: "Airtime" },
          { label: "Network", value: selectedNetwork?.toUpperCase() || "" },
          { label: "Phone Number", value: phoneNumber },
        ]}
        cashbackToEarn={cashback.cashbackToEarn}
        cashbackBalance={cashback.cashbackBalance}
        useCashback={cashback.useCashback}
        onToggleUseCashback={cashback.setUseCashback}
      />

      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handlePurchaseWithPin}
        title="Enter PIN"
        description="Enter your PIN to complete payment"
        amount={amountNum}
        serviceName={`${selectedNetwork?.toUpperCase()} Airtime`}
      />

      <TransactionResultScreen
        open={showResult}
        onClose={() => setShowResult(false)}
        success={resultSuccess}
        pending={resultPending}
        amount={amountNum}
        details={[
          { label: "Service", value: "Airtime" },
          { label: "Network", value: selectedNetwork?.toUpperCase() || "" },
          { label: "Phone Number", value: phoneNumber },
        ]}
        transactionId={resultTransactionId}
        errorMessage={resultError}
      />

      <BeneficiariesDialog
        open={showBeneficiaries}
        onClose={() => setShowBeneficiaries(false)}
        beneficiaries={beneficiaries}
        onSelect={(identifier, label, network) => {
          setPhoneNumber(identifier);
          setContactName(label);
          if (network) setSelectedNetwork(network);
        }}
        onRemove={removeBeneficiary}
        title="Saved Beneficiaries"
        identifierLabel="Phone Number"
      />
    </div>
  );
};

export default Airtime;
