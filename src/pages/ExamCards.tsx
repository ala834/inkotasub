import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, GraduationCap, BookOpen, Award, Minus, Plus, Copy, Check, Eye, EyeOff, ShieldCheck, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseEdgeFunctionError, isPendingTransaction } from "@/lib/edge-function-errors";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import TransactionResultScreen from "@/components/common/TransactionResultScreen";

interface ExamType {
  id: string;
  name: string;
  slug: string;
  amount: number;
  description?: string;
}

const EXAM_TYPES: ExamType[] = [
  { id: "waec", name: "WAEC", slug: "waec", amount: 3450, description: "West African Examination Council" },
  { id: "neco", name: "NECO", slug: "neco", amount: 1450, description: "National Examination Council" },
  { id: "nabteb", name: "NABTEB", slug: "nabteb", amount: 1450, description: "National Business & Technical Examinations Board" },
];

const examIcons: Record<string, React.ReactNode> = {
  waec: <GraduationCap className="h-7 w-7" />,
  neco: <BookOpen className="h-7 w-7" />,
  nabteb: <Award className="h-7 w-7" />,
};

const examColors: Record<string, { bg: string; text: string; border: string }> = {
  waec: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-400" },
  neco: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-400" },
  nabteb: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-400" },
};

const ExamCards = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [selectedExam, setSelectedExam] = useState<ExamType | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultSuccess, setResultSuccess] = useState(false);
  const [resultPending, setResultPending] = useState(false);
  const [resultTransactionId, setResultTransactionId] = useState("");
  const [resultError, setResultError] = useState("");
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [examPrices, setExamPrices] = useState<ExamType[]>(EXAM_TYPES);

  const [showPinResult, setShowPinResult] = useState(false);
  const [purchasedPins, setPurchasedPins] = useState<string[]>([]);
  const [purchaseRef, setPurchaseRef] = useState("");
  const [revealedPins, setRevealedPins] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => { fetchExamPrices(); }, []);

  const fetchExamPrices = async () => {
    setLoadingPrices(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-exam-plans");
      if (error) { console.error("Error fetching exam prices:", error); return; }
      if (data?.plans && data.plans.length > 0) setExamPrices(data.plans);
    } catch (error) { console.error("Error fetching exam prices:", error); }
    finally { setLoadingPrices(false); }
  };

  const totalAmount = (selectedExam?.amount || 0) * quantity;

  const validateForm = () => {
    if (!selectedExam) { toast.error("Please select an exam type"); return false; }
    if (quantity < 1 || quantity > 10) { toast.error(quantity < 1 ? "Quantity must be at least 1" : "Maximum 10 PINs per transaction"); return false; }
    if (wallet && totalAmount > wallet.balance) { toast.error("Insufficient wallet balance"); return false; }
    return true;
  };

  const handlePurchaseClick = () => { if (validateForm()) setShowPinDialog(true); };

  const handleCopyPin = (pin: string, index: number) => {
    navigator.clipboard.writeText(pin);
    setCopiedIndex(index);
    toast.success("PIN copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleRevealPin = (index: number) => {
    setRevealedPins(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const handlePurchaseWithPin = async (pin: string) => {
    if (!selectedExam) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-exam-pin", {
        body: { examType: selectedExam.slug, quantity, amount: totalAmount, transaction_pin: pin },
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
        const message = parseEdgeFunctionError(error, data, "Failed to purchase exam PIN");
        setResultSuccess(false);
        setResultPending(false);
        setResultError(message);
        setResultTransactionId("");
        setShowResult(true);
        if (!message.includes("PIN") && !message.includes("locked")) toast.error(message);
        throw new Error(message);
      }
      setResultSuccess(true);
      setResultPending(false);
      setResultTransactionId(data.reference || data.transactionId || "");
      setResultError("");
      if (data.pins && data.pins.length > 0) {
        setPurchasedPins(data.pins);
        setPurchaseRef(data.reference || "");
        setRevealedPins(new Set());
        setShowPinResult(true);
      } else {
        setShowResult(true);
      }
    } catch (error: any) {
      throw new Error(error.message || "Failed to purchase exam PIN");
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
        <h1 className="text-lg font-bold text-white">Result Checker</h1>
        <button onClick={fetchExamPrices} disabled={loadingPrices} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors">
          <RefreshCw className={cn("h-5 w-5 text-white", loadingPrices && "animate-spin")} />
        </button>
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto space-y-5">
        {/* Wallet Balance */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">Wallet Balance</p>
            <p className="text-xl font-bold text-gray-900">₦{wallet?.balance.toLocaleString() || "0.00"}</p>
          </div>
          <button onClick={() => navigate("/fund-wallet")} className="px-4 py-2 bg-green-50 text-green-600 font-semibold text-sm rounded-xl border border-green-200 active:bg-green-100 transition-colors">
            Fund Wallet
          </button>
        </motion.div>

        {/* Exam Body Selection */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">Select Exam Body</p>
          {loadingPrices ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : examPrices.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <GraduationCap className="h-10 w-10 mx-auto text-gray-300" />
              <p className="text-sm font-medium text-gray-500">Service unavailable</p>
              <p className="text-xs text-gray-400">Please try again later</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {examPrices.map((exam, index) => {
                const colors = examColors[exam.id] || examColors.waec;
                const isSelected = selectedExam?.id === exam.id;
                return (
                  <motion.button
                    key={exam.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedExam(exam)}
                    className={cn(
                      "relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all",
                      isSelected
                        ? cn(colors.border, colors.bg, "shadow-lg")
                        : "border-gray-100 bg-white hover:border-gray-200"
                    )}
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center",
                      isSelected ? colors.bg : "bg-gray-50"
                    )}>
                      <span className={isSelected ? colors.text : "text-gray-400"}>
                        {examIcons[exam.id] || <GraduationCap className="h-7 w-7" />}
                      </span>
                    </div>
                    <span className={cn("text-xs font-bold", isSelected ? colors.text : "text-gray-700")}>{exam.name}</span>
                    <span className="text-xs font-bold text-green-600">₦{exam.amount.toLocaleString()}</span>
                    {isSelected && (
                      <motion.div
                        layoutId="exam-check"
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow-md"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </motion.div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Quantity & Summary */}
        <AnimatePresence>
          {selectedExam && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
                <p className="text-sm font-semibold text-gray-700">Number of PINs</p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="w-11 h-11 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-600 active:bg-gray-100 disabled:opacity-40 transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="flex-1 text-center">
                    <span className="text-3xl font-bold text-gray-900">{quantity}</span>
                  </div>
                  <button
                    onClick={() => setQuantity(Math.min(10, quantity + 1))}
                    disabled={quantity >= 10}
                    className="w-11 h-11 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-600 active:bg-gray-100 disabled:opacity-40 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Exam Body</span>
                    <span className="font-medium text-gray-900">{selectedExam.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Price per PIN</span>
                    <span className="font-medium text-gray-900">₦{selectedExam.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Quantity</span>
                    <span className="font-medium text-gray-900">×{quantity}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="text-xl font-bold text-green-600">₦{totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Sticky Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] z-40">
        <div className="max-w-lg mx-auto">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handlePurchaseClick}
            disabled={isLoading || !selectedExam}
            className={cn(
              "w-full h-14 rounded-2xl font-bold text-lg transition-all shadow-lg",
              selectedExam
                ? "bg-gradient-to-r from-green-600 to-green-500 text-white active:from-green-700 active:to-green-600 shadow-green-500/25"
                : "bg-gray-200 text-gray-400"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            ) : selectedExam ? (
              `Buy ${quantity} ${selectedExam.name} PIN${quantity > 1 ? "s" : ""} for ₦${totalAmount.toLocaleString()}`
            ) : (
              "Select an exam type"
            )}
          </motion.button>
        </div>
      </div>

      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handlePurchaseWithPin}
        title="Confirm Purchase"
        description="Enter your PIN to buy result checker"
        amount={totalAmount}
        serviceName={`${selectedExam?.name || ""} Result Checker${quantity > 1 ? ` x${quantity}` : ""}`}
      />

      {/* Purchased PIN Display */}
      <Dialog open={showPinResult} onOpenChange={setShowPinResult}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-green-500" />
              Purchase Successful
            </DialogTitle>
            <DialogDescription>
              Your {selectedExam?.name} result checker PIN{purchasedPins.length > 1 ? "s are" : " is"} ready.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {purchasedPins.map((pin, index) => (
              <div key={index} className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
                {purchasedPins.length > 1 && (
                  <p className="text-xs text-gray-500 font-medium">PIN {index + 1}</p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <code className="flex-1 text-base font-mono font-bold text-gray-900 break-all">
                    {revealedPins.has(index) ? pin : "••••••••••••"}
                  </code>
                  <div className="flex gap-1">
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors" onClick={() => toggleRevealPin(index)}>
                      {revealedPins.has(index) ? <EyeOff className="h-4 w-4 text-gray-500" /> : <Eye className="h-4 w-4 text-gray-500" />}
                    </button>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors" onClick={() => handleCopyPin(pin, index)}>
                      {copiedIndex === index ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-500" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {purchaseRef && <p className="text-xs text-gray-400 text-center">Ref: {purchaseRef}</p>}

            <button
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold active:from-green-700 active:to-green-600 transition-colors"
              onClick={() => { setShowPinResult(false); navigate("/history"); }}
            >
              View Transaction History
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <TransactionResultScreen
        open={showResult}
        onClose={() => setShowResult(false)}
        success={resultSuccess}
        pending={resultPending}
        amount={totalAmount}
        details={[
          { label: "Service", value: "Exam Result Checker" },
          { label: "Exam Body", value: selectedExam?.name || "" },
          { label: "Quantity", value: `${quantity}` },
        ]}
        transactionId={resultTransactionId}
        errorMessage={resultError}
      />
    </div>
  );
};

export default ExamCards;
