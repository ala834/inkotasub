import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Phone, Contact, RefreshCw, Check, Wifi, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseEdgeFunctionError } from "@/lib/edge-function-errors";
import { useNetworkDetection, normalizePhoneNumber, detectNetwork } from "@/hooks/useNetworkDetection";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import TransactionConfirmationDialog from "@/components/common/TransactionConfirmationDialog";
import { useRecentNumbers } from "@/hooks/useRecentNumbers";
import TransactionResultScreen from "@/components/common/TransactionResultScreen";

interface DataPlan {
  id: string;
  name: string;
  amount: number;
  validity: string;
  category: string;
  provider?: string | null;
  dataSize?: number;
  isFeatured?: boolean;
}

const NETWORKS = [
  { id: "mtn", name: "MTN", bg: "#FFCC00", text: "#000" },
  { id: "airtel", name: "Airtel", bg: "#E40000", text: "#FFF" },
  { id: "glo", name: "Glo", bg: "#00A651", text: "#FFF" },
  { id: "9mobile", name: "9mobile", bg: "#006B53", text: "#FFF" },
];

const PLAN_TYPES = [
  { key: "SME", label: "SME" },
  { key: "Gifting", label: "Gifting" },
  { key: "Corporate", label: "Data Share" },
  { key: "Direct", label: "Direct" },
  { key: "General", label: "General" },
];

const Data = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<DataPlan | null>(null);
  const [dataPlans, setDataPlans] = useState<DataPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | undefined>();
  const [showResult, setShowResult] = useState(false);
  const [resultSuccess, setResultSuccess] = useState(false);
  const [resultError, setResultError] = useState("");
  const [resultTransactionId, setResultTransactionId] = useState<string | undefined>();
  const { recentNumbers, addRecentNumber, clearRecentNumbers } = useRecentNumbers("data");

  // Auto-detect network from phone input
  useEffect(() => {
    if (phoneNumber.length >= 4) {
      const detected = detectNetwork(phoneNumber);
      if (detected && detected !== selectedNetwork) {
        setSelectedNetwork(detected);
        setSelectedPlan(null);
      }
    }
  }, [phoneNumber]);

  // Fetch plans when network changes
  useEffect(() => {
    if (selectedNetwork) {
      fetchDataPlans();
    } else {
      setDataPlans([]);
      setSelectedPlan(null);
    }
  }, [selectedNetwork]);

  const fetchDataPlans = async (forceRefresh = false) => {
    if (!selectedNetwork) return;
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-data-plans", {
        body: { network: selectedNetwork, forceRefresh },
      });
      if (error) throw error;
      if (data?.plans && data.plans.length > 0) {
        setDataPlans(data.plans);
        const categories = [...new Set(data.plans.map((p: DataPlan) => p.category))];
        const available = PLAN_TYPES.filter(t => categories.includes(t.key));
        if (available.length > 0) setActiveCategory(available[0].key);
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

  const availableCategories = useMemo(() => {
    const cats = new Set(dataPlans.map(p => p.category));
    return PLAN_TYPES.filter(t => cats.has(t.key));
  }, [dataPlans]);

  const filteredPlans = useMemo(() => {
    let plans = dataPlans;
    if (activeCategory) plans = plans.filter(p => p.category === activeCategory);
    return [...plans].sort((a, b) => {
      const featA = a.isFeatured ? 1 : 0;
      const featB = b.isFeatured ? 1 : 0;
      if (featA !== featB) return featB - featA;
      const sizeA = a.dataSize || 99999;
      const sizeB = b.dataSize || 99999;
      if (sizeA !== sizeB) return sizeA - sizeB;
      return a.amount - b.amount;
    });
  }, [dataPlans, activeCategory]);

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
    setSelectedPlan(null);
    setActiveCategory(null);
  };

  const validateForm = () => {
    if (!selectedNetwork || !phoneNumber || !selectedPlan) {
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
          network: selectedNetwork,
          phoneNumber,
          planId: selectedPlan.id,
          amount: selectedPlan.amount,
          provider: selectedPlan.provider,
          transaction_pin: pin,
        },
      });
      if (error || !data?.success) {
        const message = parseEdgeFunctionError(error, data, "Failed to purchase data");
        if (!message.includes("PIN") && !message.includes("locked")) {
          setResultSuccess(false);
          setResultError(message);
          setResultTransactionId(data?.reference);
          setShowResult(true);
        }
        throw new Error(message);
      }
      addRecentNumber(phoneNumber, contactName);
      setResultSuccess(true);
      setResultError("");
      setResultTransactionId(data?.reference || data?.transactionId);
      setShowResult(true);
    } catch (error: any) {
      throw new Error(error.message || "Failed to purchase data");
    } finally {
      setIsLoading(false);
    }
  };

  const contactSupported = typeof window !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Green Header */}
      <header className="bg-gradient-to-r from-green-600 to-green-500 px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Buy Data</h1>
        <button
          onClick={() => fetchDataPlans(true)}
          disabled={loadingPlans}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors"
        >
          <RefreshCw className={cn("h-5 w-5 text-white", loadingPlans && "animate-spin")} />
        </button>
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
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xs shadow-sm"
                  style={{ backgroundColor: net.bg, color: net.text }}
                >
                  {net.name}
                </div>
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

          {/* Recent / Beneficiaries */}
          {recentNumbers.length > 0 && (
            <button className="flex items-center gap-2 w-full px-3 py-2.5 bg-green-50 rounded-xl text-green-700 text-sm font-medium active:bg-green-100 transition-colors">
              <Phone className="h-4 w-4" />
              <span>View Beneficiaries</span>
              <ChevronRight className="h-4 w-4 ml-auto" />
            </button>
          )}
        </motion.div>

        {/* Plan Type Toggles */}
        {selectedNetwork && availableCategories.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4"
          >
            <p className="text-sm font-semibold text-gray-700">Plan Type</p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {availableCategories.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => { setActiveCategory(cat.key); setSelectedPlan(null); }}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all",
                    activeCategory === cat.key
                      ? "bg-green-500 text-white shadow-md shadow-green-500/25"
                      : "bg-gray-100 text-gray-600 active:bg-gray-200"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Plans List */}
            {loadingPlans ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Wifi className="h-10 w-10 mx-auto text-gray-300" />
                <p className="text-gray-500 text-sm font-medium">No plans available</p>
                <p className="text-gray-400 text-xs">Try selecting a different plan type</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-0.5">
                <AnimatePresence mode="popLayout">
                  {filteredPlans.map((plan) => {
                    const isSelected = selectedPlan?.id === plan.id;
                    const net = NETWORKS.find(n => n.id === selectedNetwork);
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
                        {/* Network mini logo */}
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[10px] flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: net?.bg || "#ccc", color: net?.text || "#000" }}
                        >
                          {net?.name}
                        </div>

                        {/* Plan details */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{plan.name}</p>
                          <p className="text-xs text-gray-500">{plan.validity}</p>
                        </div>

                        {/* Price + Check */}
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
            disabled={isLoading || !selectedNetwork || !phoneNumber || !selectedPlan}
            className={cn(
              "w-full h-14 rounded-2xl font-bold text-base transition-all shadow-lg flex items-center justify-center gap-2",
              selectedPlan
                ? "bg-gradient-to-r from-green-600 to-green-500 text-white shadow-green-500/30 active:from-green-700 active:to-green-600"
                : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : selectedPlan ? (
              `Buy ${selectedPlan.name} for ₦${selectedPlan.amount.toLocaleString()}`
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
        title="Confirm Data Purchase"
        amount={selectedPlan?.amount || 0}
        walletBalanceAfter={(wallet?.balance || 0) - (selectedPlan?.amount || 0)}
        details={[
          { label: "Service", value: "Data Bundle" },
          { label: "Network", value: selectedNetwork?.toUpperCase() || "" },
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
        serviceName={`${selectedNetwork?.toUpperCase()} ${selectedPlan?.name} Data`}
      />

      <TransactionResultScreen
        open={showResult}
        onClose={() => setShowResult(false)}
        success={resultSuccess}
        amount={selectedPlan?.amount || 0}
        details={[
          { label: "Service", value: "Data Bundle" },
          { label: "Network", value: selectedNetwork?.toUpperCase() || "" },
          { label: "Phone Number", value: phoneNumber },
          { label: "Plan", value: selectedPlan?.name || "" },
        ]}
        transactionId={resultTransactionId}
        errorMessage={resultError}
      />
    </div>
  );
};

export default Data;
