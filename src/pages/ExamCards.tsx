import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  { id: "jamb", name: "JAMB", slug: "jamb", amount: 5450, description: "Joint Admissions & Matriculation Board" },
];

const ExamCards = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [selectedExam, setSelectedExam] = useState<ExamType | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [examPrices, setExamPrices] = useState<ExamType[]>(EXAM_TYPES);

  useEffect(() => {
    fetchExamPrices();
  }, []);

  const fetchExamPrices = async () => {
    setLoadingPrices(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-exam-plans");
      
      if (error) {
        console.error("Error fetching exam prices:", error);
        // Use default prices if API fails
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

    if (quantity < 1) {
      toast.error("Quantity must be at least 1");
      return false;
    }

    if (quantity > 10) {
      toast.error("Maximum 10 PINs per transaction");
      return false;
    }

    if (wallet && totalAmount > wallet.balance) {
      toast.error("Insufficient wallet balance");
      return false;
    }

    return true;
  };

  const handlePurchaseClick = () => {
    if (validateForm()) {
      setShowPinDialog(true);
    }
  };

  const handlePurchaseWithPin = async (pin: string) => {
    if (!selectedExam) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-exam-pin", {
        body: {
          examType: selectedExam.slug,
          quantity,
          amount: totalAmount,
          transaction_pin: pin,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`${selectedExam.name} PIN${quantity > 1 ? 's' : ''} purchased successfully!`);
        navigate("/dashboard");
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold">Buy Exam Cards</h1>
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

          {/* Exam Type Selection */}
          <div className="glass-card rounded-2xl p-4">
            <Label className="text-muted-foreground mb-3 block">Select Exam Type</Label>
            {loadingPrices ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {examPrices.map((exam) => (
                  <button
                    key={exam.id}
                    onClick={() => setSelectedExam(exam)}
                    className={cn(
                      "p-4 rounded-xl border-2 transition-all text-left",
                      selectedExam?.id === exam.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <GraduationCap className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{exam.name}</span>
                    </div>
                    <p className="text-lg font-bold text-primary">
                      ₦{exam.amount.toLocaleString()}
                    </p>
                    {exam.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{exam.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quantity Selection */}
          {selectedExam && (
            <div className="glass-card rounded-2xl p-4">
              <Label className="text-muted-foreground mb-3 block">Number of PINs</Label>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                  className="rounded-xl"
                >
                  -
                </Button>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-20 text-center font-bold text-lg"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.min(10, quantity + 1))}
                  disabled={quantity >= 10}
                  className="rounded-xl"
                >
                  +
                </Button>
                <div className="flex-1 text-right">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-xl font-bold text-primary">
                    ₦{totalAmount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handlePurchaseClick}
            disabled={isLoading || !selectedExam}
            className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : selectedExam ? (
              `Buy ${quantity} ${selectedExam.name} PIN${quantity > 1 ? 's' : ''} for ₦${totalAmount.toLocaleString()}`
            ) : (
              "Select an exam type"
            )}
          </Button>
        </motion.div>
      </main>

      {/* PIN Entry Dialog */}
      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handlePurchaseWithPin}
        title="Confirm Purchase"
        description="Enter your PIN to buy exam card"
        amount={totalAmount}
        serviceName={`${selectedExam?.name || ''} Exam PIN${quantity > 1 ? ` x${quantity}` : ''}`}
      />
    </div>
  );
};

export default ExamCards;
