import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, User, Phone, Loader2, AtSign, Gift, ArrowLeft, KeyRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { ForgotPasscodeDialog } from "@/components/auth/ForgotPasscodeDialog";
import { useBiometric } from "@/hooks/useBiometric";
import { storeCredentials } from "@/lib/biometric";
import { cn } from "@/lib/utils";
import inkotaLogo from "@/assets/inkota-logo.png";
import { normalizeNigerianPhone } from "@/lib/phone";
import PasscodeInput from "@/components/common/PasscodeInput";

const emailSchema = z.string().email("Please enter a valid email address");
const usernameSchema = z
  .string()
  .min(4, "Username must be at least 4 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores");

// Defined OUTSIDE component to preserve focus across re-renders
const InputField = ({ icon: Icon, id, label, error, className, ...props }: any) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="text-xs font-medium text-gray-500">
      {label}
    </label>
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
      <input
        id={id}
        {...props}
        className={cn(
          "w-full h-12 pl-11 pr-4 bg-gray-50 border rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-sm",
          error ? "border-red-300 focus:ring-red-500" : "border-gray-200",
          className,
        )}
      />
    </div>
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

type SignupStep = "details" | "create_passcode" | "confirm_passcode";

const Auth = () => {
  const navigate = useNavigate();
  const { user, signIn, signUp, isLoading, isAdmin, profile } = useAuth();
  const { loginReady, biometricLogin, locked } = useBiometric();
  const [isLogin, setIsLogin] = useState(true);
  const [loginWithEmail, setLoginWithEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [signupStep, setSignupStep] = useState<SignupStep>("details");

  const [formData, setFormData] = useState({
    email: "",
    passcode: "",
    confirmPasscode: "",
    fullName: "",
    phoneNumber: "",
    referralCode: "",
    username: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode) {
      setFormData((p) => ({ ...p, referralCode: refCode }));
      setIsLogin(false);
    }
  }, []);

  useEffect(() => {
    if (user && !isLoading) navigate(isAdmin ? "/admin" : "/dashboard");
  }, [user, isLoading, isAdmin, navigate]);

  const switchTab = (login: boolean) => {
    setIsLogin(login);
    setErrors({});
    setSignupStep("details");
    setFormData((p) => ({ ...p, passcode: "", confirmPasscode: "" }));
  };

  const validateLogin = () => {
    const e: Record<string, string> = {};
    const id = formData.username.trim();
    if (!id) e.username = "Enter email, phone or username";
    if (!formData.passcode) e.passcode = "Enter your passcode";
    else if (formData.passcode.length < 4) e.passcode = "Passcode must be at least 4 digits";
    else if (formData.passcode.length > 6) e.passcode = "Passcode must be at most 6 digits";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const validateSignupDetails = () => {
    const e: Record<string, string> = {};
    try {
      emailSchema.parse(formData.email);
    } catch (err: any) {
      e.email = err.errors[0].message;
    }
    try {
      usernameSchema.parse(formData.username);
    } catch (err: any) {
      e.username = err.errors[0].message;
    }
    if (!formData.fullName.trim()) e.fullName = "Full name is required";
    if (!formData.phoneNumber.trim()) e.phoneNumber = "Phone number is required";
    else if (!normalizeNigerianPhone(formData.phoneNumber))
      e.phoneNumber = "Use 11 digits starting with 0 (e.g. 08012345678).";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleLogin = async () => {
    if (!validateLogin()) return;
    setLoading(true);
    try {
      const identifier = formData.username.trim();
      const { data, error: lookupError } = await supabase.functions.invoke("lookup-username", {
        body: { identifier },
      });
      if (lookupError || !data?.success) {
        toast.error(data?.error || "Account not found");
        return;
      }
      const emailToUse = data.email as string;

      // Check passcode lockout
      const { data: lockData } = await supabase.functions.invoke("passcode-auth", {
        body: { action: "check_lock", email: emailToUse },
      });
      if (lockData?.locked) {
        const mins = Math.ceil((new Date(lockData.locked_until).getTime() - Date.now()) / 60000);
        toast.error(`Too many wrong attempts. Try again in ${mins} minute(s).`);
        return;
      }

      // Legacy users (no passcode set yet) → force reset flow
      if (lockData?.passcode_set === false) {
        toast.message("Welcome back! Please create a 4–6 digit passcode to continue.", {
          description: "We'll send a code to your email to verify your identity.",
        });
        setShowForgot(true);
        return;
      }

      const { error } = await signIn(emailToUse, formData.passcode);
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          await supabase.functions.invoke("passcode-auth", {
            body: { action: "record_failure", email: emailToUse },
          });
          toast.error("Incorrect passcode");
          setFormData((p) => ({ ...p, passcode: "" }));
        } else if (error.message.includes("Email not confirmed")) {
          toast.error("Please verify your email first");
        } else {
          toast.error(error.message || "Login failed");
        }
        return;
      }

      await supabase.functions.invoke("passcode-auth", {
        body: { action: "record_success", email: emailToUse },
      });
      toast.success("Welcome back! 👋");
      await storeCredentials(emailToUse, formData.passcode);
    } catch (err: any) {
      toast.error(err?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async () => {
    const pin = formData.passcode;
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      toast.error("Passcode must be 4 to 6 digits");
      return;
    }
    if (pin !== formData.confirmPasscode) {
      toast.error("Passcodes do not match");
      setFormData((p) => ({ ...p, confirmPasscode: "" }));
      return;
    }
    setLoading(true);
    try {
      const normPhone = normalizeNigerianPhone(formData.phoneNumber);
      if (!normPhone) {
        toast.error("Invalid phone number");
        setSignupStep("details");
        return;
      }

      const { data: existingPhone } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone_number", normPhone.local)
        .maybeSingle();
      if (existingPhone) {
        toast.error("This phone number is already in use.");
        setSignupStep("details");
        return;
      }

      const normalizedUsername = formData.username.trim().toLowerCase();
      const { data: existingUsername } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalizedUsername)
        .maybeSingle();
      if (existingUsername) {
        toast.error("This username is already taken.");
        setSignupStep("details");
        return;
      }

      localStorage.setItem("pendingUsername", normalizedUsername);
      const { error } = await signUp(
        formData.email,
        formData.passcode,
        formData.fullName,
        normalizedUsername,
        normPhone.local,
      );
      if (error) {
        if (error.message.includes("already registered") || error.message.includes("already been registered"))
          toast.error("This email is already registered. Please login instead.");
        else toast.error(error.message || "Signup failed");
        setSignupStep("details");
        return;
      }
      if (formData.referralCode) localStorage.setItem("pendingReferralCode", formData.referralCode.toUpperCase());

      const { data: otpData, error: otpError } = await supabase.functions.invoke("send-email-otp", {
        body: { email: formData.email, purpose: "signup" },
      });
      if (otpError || !otpData?.success) {
        toast.error(otpData?.error || "Account created but failed to send verification code.");
      } else {
        toast.success("We sent a 6-digit code to your email");
      }

      supabase.functions
        .invoke("send-welcome-email", { body: { email: formData.email, fullName: formData.fullName } })
        .catch((err) => console.error("Welcome email error:", err));

      try {
        await supabase.auth.signOut();
      } catch {}
      navigate("/verify-email", { state: { email: formData.email, password: formData.passcode } });
    } catch (err: any) {
      toast.error(err?.message || "Unexpected error");
      setSignupStep("details");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-10 w-10 text-green-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 px-6 pt-12 pb-16 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -left-8 top-16 w-32 h-32 rounded-full bg-white/5" />
        <div className="flex flex-col items-center relative z-10">
          <motion.img
            src={inkotaLogo}
            alt="Inkotasub"
            className="w-16 h-16 object-contain mb-3 rounded-2xl shadow-lg"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
          />
          <h1 className="text-2xl font-bold text-white">
            {isLogin && loginReady && !locked ? (
              <>Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋</>
            ) : (
              <>
                Inkota<span className="text-white/80">sub</span>
              </>
            )}
          </h1>
          <p className="text-white/70 text-sm mt-1">
            {isLogin ? "Sign in with your passcode" : "Create your secure account"}
          </p>
        </div>
      </div>

      <div className="px-4 -mt-8 max-w-md mx-auto relative z-10 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          {/* Tabs hidden during multi-step signup passcode entry */}
          {!(signupStep !== "details" && !isLogin) && (
            <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
              <button
                onClick={() => switchTab(true)}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
                  isLogin ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
                )}
              >
                Login
              </button>
              <button
                onClick={() => switchTab(false)}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
                  !isLogin ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
                )}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* LOGIN */}
          {isLogin && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
              className="space-y-4"
            >
              <InputField
                icon={AtSign}
                id="loginIdentifier"
                label="Email, Phone or Username"
                placeholder="you@example.com / 0801... / username"
                value={formData.username}
                onChange={(e: any) =>
                  setFormData({ ...formData, username: e.target.value.replace(/\s/g, "") })
                }
                error={errors.username}
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
              />

              <div className="pt-2">
                <p className="text-center text-xs font-medium text-gray-500 mb-3">Enter your 6-digit passcode</p>
                <PasscodeInput
                  value={formData.passcode}
                  onChange={(v) => setFormData({ ...formData, passcode: v })}
                  error={!!errors.passcode}
                  showKeypad
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-xs text-gray-500 active:text-green-600"
                >
                  Forgot passcode?
                </button>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading || formData.passcode.length !== 6}
                className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold text-sm shadow-lg shadow-green-500/25 active:from-green-700 active:to-green-600 disabled:opacity-50 flex items-center justify-center"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Login"}
              </motion.button>

              {/* Biometric Login */}
              {loginReady && !locked && (
                <div className="mt-4">
                  <div className="relative flex items-center justify-center my-3">
                    <div className="border-t border-gray-200 flex-1" />
                    <span className="px-3 text-xs text-gray-400">or</span>
                    <div className="border-t border-gray-200 flex-1" />
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    disabled={biometricLoading}
                    onClick={async () => {
                      setBiometricLoading(true);
                      try {
                        const result = await biometricLogin();
                        if (result.success && result.email && result.password) {
                          const { error } = await signIn(result.email, result.password);
                          if (error) toast.error("Biometric login failed. Please use passcode.");
                          else toast.success("Welcome back!");
                        } else {
                          toast.error(result.error || "Fingerprint verification failed");
                        }
                      } finally {
                        setBiometricLoading(false);
                      }
                    }}
                    className="w-full h-12 rounded-xl border-2 border-gray-200 bg-white text-gray-700 font-medium text-sm flex items-center justify-center gap-3 active:bg-gray-50 disabled:opacity-50"
                  >
                    {biometricLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-green-500" />
                    ) : (
                      <>
                        <KeyRound className="h-5 w-5 text-green-500" />
                        Login with Fingerprint
                      </>
                    )}
                  </motion.button>
                </div>
              )}
            </form>
          )}

          {/* SIGNUP */}
          {!isLogin && (
            <AnimatePresence mode="wait">
              {signupStep === "details" && (
                <motion.form
                  key="details"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (validateSignupDetails()) setSignupStep("create_passcode");
                  }}
                  className="space-y-3.5"
                >
                  <InputField
                    icon={User}
                    id="fullName"
                    label="Full Name"
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={(e: any) => setFormData({ ...formData, fullName: e.target.value })}
                    error={errors.fullName}
                  />
                  <InputField
                    icon={AtSign}
                    id="username"
                    label="Username"
                    placeholder="Choose a username"
                    value={formData.username}
                    onChange={(e: any) =>
                      setFormData({ ...formData, username: e.target.value.replace(/\s/g, "").toLowerCase() })
                    }
                    error={errors.username}
                    className="lowercase"
                  />
                  <InputField
                    icon={Phone}
                    id="phoneNumber"
                    label="Phone Number"
                    type="tel"
                    inputMode="numeric"
                    placeholder="08012345678"
                    value={formData.phoneNumber}
                    onChange={(e: any) =>
                      setFormData({
                        ...formData,
                        phoneNumber: e.target.value.replace(/[^\d+]/g, "").slice(0, 14),
                      })
                    }
                    error={errors.phoneNumber}
                  />
                  <InputField
                    icon={Mail}
                    id="email"
                    label="Email Address"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e: any) => setFormData({ ...formData, email: e.target.value })}
                    error={errors.email}
                  />
                  <InputField
                    icon={Gift}
                    id="referralCode"
                    label="Referral Code (Optional)"
                    placeholder="Enter referral code"
                    value={formData.referralCode}
                    onChange={(e: any) =>
                      setFormData({ ...formData, referralCode: e.target.value.toUpperCase() })
                    }
                    className="uppercase"
                  />
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold text-sm shadow-lg shadow-green-500/25"
                  >
                    Continue
                  </motion.button>
                </motion.form>
              )}

              {signupStep === "create_passcode" && (
                <motion.div
                  key="create_passcode"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-4"
                >
                  <button
                    type="button"
                    onClick={() => setSignupStep("details")}
                    className="flex items-center gap-1 text-xs text-gray-500"
                  >
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>
                  <div className="text-center">
                    <h2 className="text-lg font-bold text-gray-900">Create Your Passcode</h2>
                    <p className="text-xs text-gray-500 mt-1">
                      Choose a 6-digit code to secure your account.
                    </p>
                  </div>
                  <PasscodeInput
                    value={formData.passcode}
                    onChange={(v) => setFormData({ ...formData, passcode: v })}
                    autoFocus
                  />
                  {formData.passcode.length === 6 && (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      type="button"
                      onClick={() => setSignupStep("confirm_passcode")}
                      className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold text-sm"
                    >
                      Next
                    </motion.button>
                  )}
                </motion.div>
              )}

              {signupStep === "confirm_passcode" && (
                <motion.div
                  key="confirm_passcode"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-4"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((p) => ({ ...p, confirmPasscode: "" }));
                      setSignupStep("create_passcode");
                    }}
                    className="flex items-center gap-1 text-xs text-gray-500"
                  >
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>
                  <div className="text-center">
                    <h2 className="text-lg font-bold text-gray-900">Confirm Passcode</h2>
                    <p className="text-xs text-gray-500 mt-1">Re-enter your 6-digit passcode.</p>
                  </div>
                  <PasscodeInput
                    value={formData.confirmPasscode}
                    onChange={(v) => setFormData({ ...formData, confirmPasscode: v })}
                    autoFocus
                    error={
                      formData.confirmPasscode.length === 6 &&
                      formData.confirmPasscode !== formData.passcode
                    }
                  />
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={handleSignupSubmit}
                    disabled={loading || formData.confirmPasscode.length !== 6}
                    className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Account"}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {signupStep === "details" && (
            <div className="mt-5 text-center">
              <p className="text-sm text-gray-500">
                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => switchTab(!isLogin)}
                  className="text-green-600 font-semibold active:text-green-700"
                >
                  {isLogin ? "Sign Up" : "Login"}
                </button>
              </p>
            </div>
          )}
        </motion.div>
      </div>

      <ForgotPasscodeDialog
        open={showForgot}
        onOpenChange={setShowForgot}
        prefilledEmail={loginWithEmail ? formData.email : undefined}
      />
    </div>
  );
};

export default Auth;
