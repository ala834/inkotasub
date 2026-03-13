import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, GraduationCap, BookOpen, Award, Minus, Plus, Copy, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PinEntryDialog from "@/components/common/PinEntryDialog";

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
  waec: <GraduationCap className="h-6 w-6" />,
  neco: <BookOpen className="h-6 w-6" />,
  nabteb: <Award className="h-6 w-6" />,
};

const examGradients: Record<string, string> = {
  waec: "from-emerald-500/20 to-teal-600/20 dark:from-emerald-500/10 dark:to-teal-600/10",
  neco: "from-blue-500/20 to-indigo-600/20 dark:from-blue-500/10 dark:to-indigo-600/10",
  nabteb: "from-amber-500/20 to-orange-600/20 dark:from-amber-500/10 dark:to-orange-600/10",
};

const examAccents: Record<string, string> = {
  waec: "text-emerald-600 dark:text-emerald-400",
  neco: "text-blue-600 dark:text-blue-400",
  nabteb: "text-amber-600 dark:text-amber-400",
};

const examBorderAccents: Record<string, string> = {
  waec: "border-emerald-500/40",
  neco: "border-blue-500/40",
  nabteb: "border-amber-500/40",
};

const ExamCards = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [selectedExam, setSelectedExam] = useState<ExamType | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [examPrices, setExamPrices] = useState<ExamType[]>(EXAM_TYPES);

  // PIN display state
  const [showPinResult, setShowPinResult] = useState(false);
  const [purchasedPins, setPurchasedPins] = useState<string[]>([]);
  const [purchaseRef, setPurchaseRef] = useState("");
  const [revealedPins, setRevealedPins] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchExamPrices();
  }, []);

  const fetchExamPrices = async () => {
    setLoadingPrices(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-exam-plans");
      if (error) {
        console.error("Error fetching exam prices:", error);
        return;
      }
      if (data?.plans && data.plans.length > 0) {
        setExamPrices(data.plans);
      }
    } catch (error) {
      console.error("Error fetching exam prices:", error);
    } finally {
      setLoadingPrices(false);
    }
  };

  const totalAmount = (selectedExam?.amount || 0) * quantity;

  const validateForm = () => {
    if (!selectedExam) {
      toast.error("Please select an exam type");
      return false;
    }
    if (quantity < 1 || quantity > 10) {
      toast.error(quantity < 1 ? "Quantity must be at least 1" : "Maximum 10 PINs per transaction");
      return false;
    }
    if (wallet && totalAmount > wallet.balance) {
      toast.error("Insufficient wallet balance");
      return false;
    }
    return true;
  };

  const handlePurchaseClick = () => {
    if (validateForm()) setShowPinDialog(true);
  };

  const handleCopyPin = (pin: string, index: number) => {
    navigator.clipboard.writeText(pin);
    setCopiedIndex(index);
    toast.success("PIN copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleRevealPin = (index: number) => {
    setRevealedPins(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
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
      if (error) throw error;
      if (data?.success) {
        toast.success(`${selectedExam.name} PIN${quantity > 1 ? "s" : ""} purchased successfully!`);

        // Show PIN result dialog if PINs returned
        if (data.pins && data.pins.length > 0) {
          setPurchasedPins(data.pins);
          setPurchaseRef(data.reference || "");
          setRevealedPins(new Set());
          setShowPinResult(true);
        } else {
          // No PINs in response — check transaction history
          toast.info("Your PIN will appear in your transaction history shortly.");
          navigate("/history");
        }
      } else {
        throw new Error(data?.message || "Purchase failed");
      }
    } catch (error: any) {
      throw new Error(error.message || "Failed to purchase exam PIN");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero pb-6">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-display font-bold">Result Checker</h1>
            <p className="text-xs text-muted-foreground">Purchase exam result checker PINs</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          {/* Wallet Balance */}
          <div className="relative overflow-hidden rounded-2xl gradient-primary p-5 text-primary-foreground">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/2" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm opacity-80">Wallet Balance</p>
                <p className="text-2xl font-bold mt-0.5">₦{wallet?.balance.toLocaleString() || "0.00"}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/fund-wallet")}
                className="rounded-xl bg-white/20 hover:bg-white/30 text-primary-foreground border-0"
              >
                Fund Wallet
              </Button>
            </div>
          </div>

          {/* Exam Type Selection */}
          <div>
            <Label className="text-muted-foreground mb-3 block text-sm font-medium">Select Exam Body</Label>
            {loadingPrices ? (
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {examPrices.map((exam, index) => (
                  <motion.button
                    key={exam.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 }}
                    onClick={() => setSelectedExam(exam)}
                    className={cn(
                      "relative overflow-hidden p-4 rounded-2xl border-2 transition-all text-left group",
                      "bg-gradient-to-br backdrop-blur-sm",
                      examGradients[exam.id] || examGradients.waec,
                      selectedExam?.id === exam.id
                        ? cn("ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg", examBorderAccents[exam.id])
                        : "border-border/50 hover:border-primary/30 hover:shadow-md"
                    )}
                  >
                    <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
                    <div className={cn("mb-2", examAccents[exam.id] || "text-primary")}>
                      {examIcons[exam.id] || <GraduationCap className="h-6 w-6" />}
                    </div>
                    <span className="font-bold text-base text-foreground block">{exam.name}</span>
                    <p className="text-lg font-bold text-primary mt-1">₦{exam.amount.toLocaleString()}</p>
                    {exam.description && (
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1 leading-tight">{exam.description}</p>
                    )}
                    {selectedExam?.id === exam.id && (
                      <motion.div
                        layoutId="exam-check"
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                      >
                        <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </motion.div>
                    )}
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Quantity & Summary */}
          <AnimatePresence>
            {selectedExam && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="glass-card rounded-2xl p-5 space-y-4">
                  <Label className="text-muted-foreground text-sm font-medium">Number of PINs</Label>
                  <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1} className="rounded-xl h-11 w-11">
                      <Minus className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 text-center">
                      <span className="text-3xl font-bold text-foreground">{quantity}</span>
                    </div>
                    <Button variant="outline" size="icon" onClick={() => setQuantity(Math.min(10, quantity + 1))} disabled={quantity >= 10} className="rounded-xl h-11 w-11">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="border-t border-border/50 pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Exam Body</span>
                      <span className="font-medium text-foreground">{selectedExam.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Price per PIN</span>
                      <span className="font-medium text-foreground">₦{selectedExam.amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Quantity</span>
                      <span className="font-medium text-foreground">×{quantity}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border/50">
                      <span className="font-semibold text-foreground">Total</span>
                      <span className="text-xl font-bold text-primary">₦{totalAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <Button
            onClick={handlePurchaseClick}
            disabled={isLoading || !selectedExam}
            className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg shadow-lg hover:shadow-xl transition-shadow"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : selectedExam ? (
              `Buy ${quantity} ${selectedExam.name} PIN${quantity > 1 ? "s" : ""}`
            ) : (
              "Select an exam type"
            )}
          </Button>
        </motion.div>
      </main>

      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handlePurchaseWithPin}
        title="Confirm Purchase"
        description="Enter your PIN to buy result checker"
        amount={totalAmount}
        serviceName={`${selectedExam?.name || ""} Result Checker${quantity > 1 ? ` x${quantity}` : ""}`}
      />

      {/* Purchased PIN Display Dialog */}
      <Dialog open={showPinResult} onOpenChange={setShowPinResult}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Purchase Successful
            </DialogTitle>
            <DialogDescription>
              Your {selectedExam?.name} result checker PIN{purchasedPins.length > 1 ? "s" : ""} {purchasedPins.length > 1 ? "are" : "is"} ready. Keep {purchasedPins.length > 1 ? "them" : "it"} safe!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {purchasedPins.map((pin, index) => (
              <div key={index} className="rounded-xl border border-border bg-muted/50 p-4 space-y-2">
                {purchasedPins.length > 1 && (
                  <p className="text-xs text-muted-foreground font-medium">PIN {index + 1}</p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <code className="flex-1 text-base font-mono font-bold text-foreground break-all">
                    {revealedPins.has(index) ? pin : "••••••••••••"}
                  </code>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleRevealPin(index)}>
                      {revealedPins.has(index) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyPin(pin, index)}>
                      {copiedIndex === index ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {purchaseRef && (
              <p className="text-xs text-muted-foreground text-center">Ref: {purchaseRef}</p>
            )}

            <Button
              className="w-full mt-2"
              onClick={() => {
                setShowPinResult(false);
                navigate("/history");
              }}
            >
              View Transaction History
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExamCards;
