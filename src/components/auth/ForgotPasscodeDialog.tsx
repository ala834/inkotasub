import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, KeyRound, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import PasscodeInput from "@/components/common/PasscodeInput";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledEmail?: string;
}

type Step = "email" | "otp" | "newpasscode" | "done";

const emailSchema = z.string().email("Enter a valid email address");

export const ForgotPasscodeDialog = ({ open, onOpenChange, prefilledEmail }: Props) => {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(prefilledEmail || "");
  const [otp, setOtp] = useState("");
  const [token, setToken] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (prefilledEmail) setEmail(prefilledEmail);
  }, [prefilledEmail]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const reset = () => {
    setStep("email");
    setOtp("");
    setToken("");
    setNewPasscode("");
    setConfirmPasscode("");
    setResendIn(0);
  };

  const sendOtp = async () => {
    try {
      emailSchema.parse(email);
    } catch (e: any) {
      toast.error(e.errors?.[0]?.message || "Invalid email");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-otp", {
        body: { email, purpose: "reset_passcode" },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Failed to send code");
        return;
      }
      toast.success("Verification code sent");
      setResendIn(30);
      setStep("otp");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-email-otp", {
        body: { email, code: otp, purpose: "reset_passcode" },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Invalid code");
        setOtp("");
        return;
      }
      setToken(data.verification_token);
      setStep("newpasscode");
    } finally {
      setLoading(false);
    }
  };

  const submitPasscode = async () => {
    if (newPasscode.length < 4 || newPasscode.length > 6 || !/^\d+$/.test(newPasscode)) {
      toast.error("Passcode must be 4 to 6 digits");
      return;
    }
    if (newPasscode !== confirmPasscode) {
      toast.error("Passcodes do not match");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("passcode-auth", {
        body: { action: "reset_passcode", email, verification_token: token, new_passcode: newPasscode },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Failed to set passcode");
        return;
      }
      setStep("done");
      toast.success("Passcode updated. You can now log in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="rounded-2xl max-w-sm">
        {step === "email" && (
          <>
            <DialogHeader>
              <div className="mx-auto w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-2">
                <Mail className="h-7 w-7 text-green-500" />
              </div>
              <DialogTitle className="text-center">Forgot Passcode?</DialogTitle>
              <DialogDescription className="text-center">
                Enter your account email and we'll send a 6-digit code.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 rounded-xl"
              />
            </div>
            <Button
              onClick={sendOtp}
              disabled={loading}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Code"}
            </Button>
          </>
        )}

        {step === "otp" && (
          <>
            <DialogHeader>
              <div className="mx-auto w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-2">
                <KeyRound className="h-7 w-7 text-green-500" />
              </div>
              <DialogTitle className="text-center">Enter 6-digit Code</DialogTitle>
              <DialogDescription className="text-center text-xs">
                Sent to {email}. Expires in 5 minutes.
              </DialogDescription>
            </DialogHeader>
            <div className="py-3">
              <Input
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className="h-14 rounded-xl text-center text-2xl tracking-[0.6em] font-mono"
              />
              <div className="text-center mt-3">
                <button
                  type="button"
                  disabled={resendIn > 0 || loading}
                  onClick={sendOtp}
                  className="text-xs text-green-600 font-medium disabled:text-gray-400"
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </div>
            </div>
            <Button
              onClick={verifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
            </Button>
          </>
        )}

        {step === "newpasscode" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-center">
                {newPasscode.length < 4 ? "Create New Passcode" : "Confirm Passcode"}
              </DialogTitle>
              <DialogDescription className="text-center text-xs">
                Choose a 4 to 6 digit passcode. Don't share it.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <PasscodeInput
                value={newPasscode}
                onChange={(v) => {
                  setNewPasscode(v);
                  if (v.length < confirmPasscode.length) setConfirmPasscode("");
                }}
                length={6}
                autoFocus
              />
              {newPasscode.length >= 4 && (
                <>
                  <p className="text-center text-xs text-gray-500 pt-2">Confirm passcode</p>
                  <PasscodeInput
                    value={confirmPasscode}
                    onChange={setConfirmPasscode}
                    length={newPasscode.length}
                    showKeypad={false}
                  />
                </>
              )}
            </div>
            {newPasscode.length >= 4 && (
              <Button
                onClick={submitPasscode}
                disabled={loading || confirmPasscode.length !== newPasscode.length}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set Passcode"}
              </Button>
            )}
          </>
        )}

        {step === "done" && (
          <DialogHeader>
            <div className="mx-auto w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-2">
              <Check className="h-7 w-7 text-green-500" />
            </div>
            <DialogTitle className="text-center">Passcode Updated</DialogTitle>
            <DialogDescription className="text-center">
              Use your new 6-digit passcode to log in.
            </DialogDescription>
            <Button
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
              className="w-full h-12 rounded-xl mt-3 bg-gradient-to-r from-green-600 to-green-500 text-white"
            >
              Done
            </Button>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ForgotPasscodeDialog;
