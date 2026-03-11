import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Zap, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import RecentNumbers from "@/components/common/RecentNumbers";
import { useRecentNumbers } from "@/hooks/useRecentNumbers";

const discos = [
  { id: "ikeja", name: "Ikeja Electric (IE)" },
  { id: "eko", name: "Eko Electric (EKEDC)" },
  { id: "abuja", name: "Abuja Electric (AEDC)" },
  { id: "kano", name: "Kano Electric (KEDCO)" },
  { id: "portharcourt", name: "Port Harcourt Electric (PHED)" },
  { id: "ibadan", name: "Ibadan Electric (IBEDC)" },
  { id: "kaduna", name: "Kaduna Electric (KAEDCO)" },
  { id: "jos", name: "Jos Electric (JED)" },
  { id: "enugu", name: "Enugu Electric (EEDC)" },
  { id: "benin", name: "Benin Electric (BEDC)" },
];

const Electricity = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [disco, setDisco] = useState("");
  const [meterType, setMeterType] = useState<"prepaid" | "postpaid">("prepaid");
  const [meterNumber, setMeterNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [isValidated, setIsValidated] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const { recentNumbers, addRecentNumber, clearRecentNumbers } = useRecentNumbers("electricity");

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
    const amountNum = parseFloat(amount);
    if (wallet && amountNum > wallet.balance) {
      toast.error("Insufficient wallet balance");
      return false;
    }
    return true;
  };

  const handlePurchaseClick = () => {
    if (validateForm()) setShowPinDialog(true);
  };

  const handlePurchaseWithPin = async (pin: string) => {
    const amountNum = parseFloat(amount);
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
      if (error) throw error;
      if (data?.success) {
        addRecentNumber(meterNumber, customerName || undefined);
        toast.success(`Electricity token: ${data.token}`);
        navigate("/dashboard");
      } else {
        throw new Error(data?.message || "Purchase failed");
      }
    } catch (error: any) {
      throw new Error(error.message || "Failed to purchase electricity");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedDisco = discos.find(d => d.id === disco);

  return (
    <div className="min-h-screen gradient-hero pb-6">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold">Pay Electricity Bill</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Wallet Balance */}
          <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
              <p className="text-xl font-bold text-foreground">₦{wallet?.balance.toLocaleString() || "0.00"}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/fund-wallet")} className="rounded-xl">
              Fund Wallet
            </Button>
          </div>

          {/* Disco Selection */}
          <div className="glass-card rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="font-medium">Electricity Bill</p>
                <p className="text-sm text-muted-foreground">Pay your electricity bill</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Select Disco</Label>
              <Select value={disco} onValueChange={(v) => { setDisco(v); setIsValidated(false); }}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Select distribution company" />
                </SelectTrigger>
                <SelectContent>
                  {discos.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Meter Type</Label>
              <div className="grid grid-cols-2 gap-3">
                {["prepaid", "postpaid"].map((type) => (
                  <button
                    key={type}
                    onClick={() => { setMeterType(type as "prepaid" | "postpaid"); setIsValidated(false); }}
                    className={cn(
                      "p-3 rounded-xl border-2 capitalize transition-all",
                      meterType === type
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meter">Meter Number</Label>
              <Input
                id="meter"
                value={meterNumber}
                onChange={(e) => { setMeterNumber(e.target.value); setIsValidated(false); }}
                placeholder="Enter meter number"
                className="h-12 rounded-xl"
              />
            </div>

            {/* Recent meter numbers */}
            <RecentNumbers
              numbers={recentNumbers}
              onSelect={(num) => { setMeterNumber(num); setIsValidated(false); }}
              onClear={clearRecentNumbers}
            />

            <Button
              onClick={handleValidate}
              disabled={isValidating || !disco || !meterNumber}
              variant="outline"
              className="w-full h-12 rounded-xl"
            >
              {isValidating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isValidated ? (
                <>
                  <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
                  Verified: {customerName}
                </>
              ) : (
                "Validate Meter"
              )}
            </Button>
          </div>

          {/* Amount */}
          {isValidated && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-4">
              <Label htmlFor="amount">Amount (₦)</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount (min ₦500)"
                className="h-12 rounded-xl mt-2"
              />
            </motion.div>
          )}

          {/* Submit */}
          <Button
            onClick={handlePurchaseClick}
            disabled={isLoading || !isValidated || !amount}
            className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              `Pay ₦${parseFloat(amount || "0").toLocaleString()}`
            )}
          </Button>
        </motion.div>
      </main>

      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handlePurchaseWithPin}
        title="Confirm Payment"
        description="Enter your PIN to pay electricity bill"
        amount={parseFloat(amount) || 0}
        serviceName={`${selectedDisco?.name || disco} - ${meterType}`}
      />
    </div>
  );
};

export default Electricity;
