import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Lock, Loader2, CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PinSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const PinSetupDialog = ({ open, onOpenChange, onSuccess }: PinSetupDialogProps) => {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSetPin = async () => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-pin", {
        body: { action: "set", new_pin: pin },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setIsSuccess(true);
      toast.success("Transaction PIN set successfully!");
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
        setIsSuccess(false);
        setPin("");
        setConfirmPin("");
      }, 1500);
    } catch (error: any) {
      toast.error(error.message || "Failed to set PIN");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            {isSuccess ? (
              <CheckCircle className="h-8 w-8 text-primary" />
            ) : (
              <Shield className="h-8 w-8 text-primary" />
            )}
          </div>
          <DialogTitle className="text-xl font-display">
            {isSuccess ? "PIN Set Successfully!" : "Create Transaction PIN"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isSuccess
              ? "Your account is now secured for transactions."
              : "Set a 4-digit PIN to secure your transactions. You'll need this PIN for every payment."}
          </DialogDescription>
        </DialogHeader>

        {!isSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-2">
              <Label htmlFor="setupPin">New PIN</Label>
              <Input
                id="setupPin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter 4-digit PIN"
                className="h-12 rounded-xl text-center text-lg tracking-widest"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setupConfirmPin">Confirm PIN</Label>
              <Input
                id="setupConfirmPin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                placeholder="Confirm 4-digit PIN"
                className="h-12 rounded-xl text-center text-lg tracking-widest"
              />
            </div>

            <div className="p-3 rounded-xl bg-muted/50 border border-border">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Your PIN is encrypted and stored securely. Never share it with anyone.
                </p>
              </div>
            </div>

            <Button
              onClick={handleSetPin}
              disabled={isLoading || pin.length !== 4 || confirmPin.length !== 4}
              className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Set Transaction PIN"
              )}
            </Button>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PinSetupDialog;
