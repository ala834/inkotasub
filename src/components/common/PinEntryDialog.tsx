import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, Loader2, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PinEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (pin: string) => Promise<void>;
  title?: string;
  description?: string;
  amount?: number;
  serviceName?: string;
}

const PinEntryDialog = ({
  open,
  onOpenChange,
  onSubmit,
  title = "Enter Transaction PIN",
  description = "Please enter your 4-digit transaction PIN to proceed",
  amount,
  serviceName,
}: PinEntryDialogProps) => {
  const [pin, setPin] = useState(["", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPin, setShowPin] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPin(["", "", "", ""]);
      setError("");
      setIsLoading(false);
      // Focus first input after a short delay
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [open]);

  const handleChange = (index: number, value: string) => {
    // Only allow numbers
    if (value && !/^\d$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    setError("");

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pastedData.length === 4) {
      setPin(pastedData.split(""));
      inputRefs.current[3]?.focus();
    }
  };

  const handleSubmit = async () => {
    const fullPin = pin.join("");
    if (fullPin.length !== 4) {
      setError("Please enter your complete 4-digit PIN");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await onSubmit(fullPin);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Invalid PIN. Please try again.");
      setPin(["", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-xl font-display">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* Transaction Summary */}
        {(amount || serviceName) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-muted/50 border border-border space-y-2"
          >
            {serviceName && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Service</span>
                <span className="font-medium">{serviceName}</span>
              </div>
            )}
            {amount && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="text-lg font-bold text-primary">
                  {formatCurrency(amount)}
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* PIN Input */}
        <div className="space-y-4">
          <div className="flex justify-center gap-3">
            {pin.map((digit, index) => (
              <div key={index} className="relative">
                <Input
                  ref={(el) => (inputRefs.current[index] = el)}
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  className={cn(
                    "w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all",
                    digit ? "border-primary bg-primary/5" : "border-border",
                    error && "border-destructive"
                  )}
                  disabled={isLoading}
                />
              </div>
            ))}
          </div>

          {/* Show/Hide PIN */}
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="flex items-center gap-2 mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPin ? (
              <>
                <EyeOff className="h-4 w-4" />
                Hide PIN
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Show PIN
              </>
            )}
          </button>

          {/* Error Message */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-destructive text-center"
            >
              {error}
            </motion.p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="flex-1 h-12 rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || pin.some((d) => !d)}
            className="flex-1 h-12 rounded-xl"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              "Confirm"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PinEntryDialog;
