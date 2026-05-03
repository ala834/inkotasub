import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import inkotaLogo from "@/assets/inkota-logo.png";

const RESEND_SECONDS = 30;

const VerifyEmailOTP = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const email: string | undefined = location.state?.email;
  const password: string | undefined = location.state?.password;

  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) {
      navigate("/auth", { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const handleChange = (i: number, value: string) => {
    const v = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = v;
    setCode(next);
    if (v && i < 5) inputsRef.current[i + 1]?.focus();
    if (next.every((c) => c) && next.join("").length === 6) {
      void verify(next.join(""));
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[i] && i > 0) inputsRef.current[i - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = text.split("").concat(Array(6).fill("")).slice(0, 6);
    setCode(next);
    if (text.length === 6) void verify(text);
    else inputsRef.current[text.length]?.focus();
  };

  const verify = async (codeStr: string) => {
    if (!email) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-email-otp", {
        body: { email, code: codeStr, purpose: "signup" },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Invalid OTP. Please try again.");
        setCode(["", "", "", "", "", ""]);
        inputsRef.current[0]?.focus();
        return;
      }
      toast.success("Email verified! Logging you in...");
      // Auto-login if we have password, otherwise send to auth
      if (password) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          toast.error("Verified. Please login to continue.");
          navigate("/auth", { replace: true });
          return;
        }
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/auth", { replace: true });
      }
    } catch (e: any) {
      toast.error(e?.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email || secondsLeft > 0) return;
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-otp", {
        body: { email, purpose: "signup" },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Failed to resend code");
        return;
      }
      toast.success("New code sent to your email");
      setSecondsLeft(RESEND_SECONDS);
      setCode(["", "", "", "", "", ""]);
      inputsRef.current[0]?.focus();
    } finally {
      setResending(false);
    }
  };

  const masked = email
    ? email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + "*".repeat(Math.min(b.length, 4)) + c)
    : "";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 px-6 pt-12 pb-16 relative overflow-hidden">
        <button
          onClick={() => navigate("/auth", { replace: true })}
          className="absolute top-4 left-4 text-white/80 active:text-white p-2"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center relative z-10">
          <motion.img
            src={inkotaLogo}
            alt="Inkotasub"
            className="w-16 h-16 object-contain mb-3 rounded-2xl shadow-lg"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
          />
          <h1 className="text-2xl font-bold text-white">Verify your email</h1>
          <p className="text-white/80 text-sm mt-1 text-center px-4">
            We sent a 6-digit code to <span className="font-medium">{masked}</span>
          </p>
        </div>
      </div>

      <div className="px-4 -mt-8 max-w-md mx-auto relative z-10 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-4">
            <Mail className="h-4 w-4" />
            <span>Enter the code below — it expires in 5 minutes</span>
          </div>

          <div className="flex justify-between gap-2 mb-5">
            {code.map((d, i) => (
              <input
                key={i}
                ref={(el) => (inputsRef.current[i] = el)}
                type="tel"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                className={cn(
                  "w-11 h-14 text-center text-xl font-bold rounded-xl border-2 bg-gray-50 text-gray-900",
                  "focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all",
                  d ? "border-green-500 bg-white" : "border-gray-200"
                )}
              />
            ))}
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="button"
            disabled={verifying || code.join("").length !== 6}
            onClick={() => verify(code.join(""))}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold text-sm shadow-lg shadow-green-500/25 active:from-green-700 active:to-green-600 disabled:opacity-50 flex items-center justify-center"
          >
            {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify"}
          </motion.button>

          <div className="text-center mt-5 text-sm">
            <span className="text-gray-500">Didn't receive the code? </span>
            {secondsLeft > 0 ? (
              <span className="text-gray-400">Resend in {secondsLeft}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-green-600 font-semibold active:text-green-700 disabled:opacity-50"
              >
                {resending ? "Sending..." : "Resend code"}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default VerifyEmailOTP;
