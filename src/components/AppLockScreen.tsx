import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, KeyRound, LogOut, Lock } from "lucide-react";
import { toast } from "sonner";
import PasscodeInput from "@/components/common/PasscodeInput";
import { useAuth } from "@/contexts/AuthContext";
import { useAppLock } from "@/contexts/AppLockContext";
import { useBiometric } from "@/hooks/useBiometric";
import { supabase } from "@/integrations/supabase/client";
import { wrapPasscode } from "@/lib/passcode";
import inkotaLogo from "@/assets/inkota-logo.png";

const AppLockScreen = () => {
  const { user, profile, signOut } = useAuth();
  const { unlock } = useAppLock();
  const { loginReady, locked: bioLocked, biometricLogin } = useBiometric();
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  const verify = async (passcode: string) => {
    if (!user?.email) return;
    setVerifying(true);
    setError(false);
    try {
      // Re-authenticate without signing out — this just refreshes the session.
      const { error: err } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: wrapPasscode(passcode),
      });
      if (err) {
        setError(true);
        setPin("");
        toast.error("Incorrect passcode");
        return;
      }
      unlock();
    } catch (e: any) {
      setError(true);
      toast.error(e?.message || "Could not verify passcode");
    } finally {
      setVerifying(false);
    }
  };

  // Only validate at exact lengths 4 or 6. At length 4, wait long enough
  // for the user to keep typing toward 6 digits before auto-submitting.
  useEffect(() => {
    if (verifying) return;
    if (pin.length !== 4 && pin.length !== 6) return;
    const delay = pin.length === 6 ? 0 : 1200;
    const t = setTimeout(() => {
      // Re-check length at fire time in case user kept typing
      if (pin.length === 4 || pin.length === 6) verify(pin);
    }, delay);
    return () => clearTimeout(t);
  }, [pin]);

  const handleBiometric = async () => {
    setBioBusy(true);
    try {
      const result = await biometricLogin();
      if (result.success) {
        unlock();
      } else {
        toast.error(result.error || "Fingerprint failed");
      }
    } finally {
      setBioBusy(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    unlock();
  };

  const firstName = profile?.full_name?.split(" ")[0] || "";

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="flex flex-col items-center"
        >
          <div className="relative">
            <img
              src={inkotaLogo}
              alt="Inkotasub"
              className="w-20 h-20 rounded-3xl shadow-2xl object-contain"
            />
            <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1.5 shadow">
              <Lock className="h-4 w-4 text-green-600" />
            </div>
          </div>
          <h1 className="text-white text-xl font-bold mt-5">
            {firstName ? `Welcome back, ${firstName}` : "App Locked"}
          </h1>
          <p className="text-white/80 text-sm mt-1">Enter your passcode to continue</p>
        </motion.div>

        <div className="w-full max-w-sm mt-8 bg-white rounded-3xl p-5 shadow-2xl">
          <PasscodeInput
            value={pin}
            onChange={(v) => {
              setPin(v);
              if (error) setError(false);
            }}
            length={6}
            error={error}
            autoFocus
            showKeypad
          />

          {verifying && (
            <div className="flex justify-center mt-3">
              <Loader2 className="h-5 w-5 animate-spin text-green-600" />
            </div>
          )}

          {loginReady && !bioLocked && (
            <button
              type="button"
              onClick={handleBiometric}
              disabled={bioBusy}
              className="mt-4 w-full h-11 rounded-xl border border-gray-200 flex items-center justify-center gap-2 text-sm font-medium text-gray-700 active:bg-gray-50 disabled:opacity-50"
            >
              {bioBusy ? (
                <Loader2 className="h-4 w-4 animate-spin text-green-600" />
              ) : (
                <>
                  <KeyRound className="h-4 w-4 text-green-600" />
                  Use fingerprint
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="pb-8 px-6 flex justify-center">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-white/90 text-sm font-medium px-5 py-2.5 rounded-full bg-white/10 active:bg-white/20"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  );
};

export default AppLockScreen;
