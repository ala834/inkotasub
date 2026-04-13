import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, Phone, Loader2, AtSign, Gift } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { useBiometric } from "@/hooks/useBiometric";
import { storeCredentials } from "@/lib/biometric";
import { cn } from "@/lib/utils";
import inkotaLogo from "@/assets/inkota-logo.png";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const usernameSchema = z.string().min(4, "Username must be at least 4 characters").regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores");

const Auth = () => {
  const navigate = useNavigate();
  const { user, signIn, signUp, isLoading, isAdmin, profile } = useAuth();
  const { loginReady, biometricLogin, locked } = useBiometric();
  const [isLogin, setIsLogin] = useState(true);
  const [loginWithEmail, setLoginWithEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const [formData, setFormData] = useState({
    email: "", password: "", confirmPassword: "", fullName: "",
    phoneNumber: "", referralCode: "", username: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode) { setFormData(prev => ({ ...prev, referralCode: refCode })); setIsLogin(false); }
  }, []);

  useEffect(() => {
    if (user && !isLoading) navigate(isAdmin ? "/admin" : "/dashboard");
  }, [user, isLoading, isAdmin, navigate]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (isLogin) {
      if (loginWithEmail) {
        try { emailSchema.parse(formData.email); } catch (e) { if (e instanceof z.ZodError) newErrors.email = e.errors[0].message; }
      } else {
        try { usernameSchema.parse(formData.username); } catch (e) { if (e instanceof z.ZodError) newErrors.username = e.errors[0].message; }
      }
    } else {
      try { emailSchema.parse(formData.email); } catch (e) { if (e instanceof z.ZodError) newErrors.email = e.errors[0].message; }
      try { usernameSchema.parse(formData.username); } catch (e) { if (e instanceof z.ZodError) newErrors.username = e.errors[0].message; }
      if (!formData.fullName.trim()) newErrors.fullName = "Full name is required";
      if (!formData.phoneNumber.trim() || formData.phoneNumber.replace(/\D/g, "").length < 10) newErrors.phoneNumber = "Please enter a valid phone number";
      if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = "Passwords do not match";
    }
    try { passwordSchema.parse(formData.password); } catch (e) { if (e instanceof z.ZodError) newErrors.password = e.errors[0].message; }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      if (isLogin) {
        let emailToUse = formData.email;
        if (!loginWithEmail) {
          const { data, error: lookupError } = await supabase.functions.invoke("lookup-username", { body: { username: formData.username } });
          if (lookupError || !data?.success) { toast.error("Username not found"); setLoading(false); return; }
          emailToUse = data.email;
        }
        const { error } = await signIn(emailToUse, formData.password);
        if (error) {
          if (error.message.includes("Invalid login credentials")) toast.error("Invalid credentials");
          else if (error.message.includes("Email not confirmed")) toast.error("Please verify your email address first");
          else if (error.message === "Failed to fetch" || error.message.includes("NetworkError")) toast.error("Network error. Please check your connection.");
          else toast.error(error.message || "Login failed");
          return;
        }
        toast.success("Welcome back! 👋");
        await storeCredentials(emailToUse, formData.password);
      } else {
        if (formData.phoneNumber) {
          const { data: existingPhone } = await supabase.from("profiles").select("id").eq("phone_number", formData.phoneNumber.replace(/\D/g, "").replace(/^(\d{10})$/, "0$1")).maybeSingle();
          if (existingPhone) { toast.error("This phone number is already in use."); setLoading(false); return; }
        }
        const normalizedUsername = formData.username.trim().toLowerCase();
        const { data: existingUsername } = await supabase.from("profiles").select("id").eq("username", normalizedUsername).maybeSingle();
        if (existingUsername) { toast.error("This username is already taken."); setLoading(false); return; }
        localStorage.setItem("pendingUsername", normalizedUsername);
        const { error } = await signUp(formData.email, formData.password, formData.fullName, normalizedUsername);
        if (error) {
          if (error.message.includes("already registered") || error.message.includes("already been registered")) toast.error("This email is already registered. Please login instead.");
          else if (error.message === "Failed to fetch" || error.message.includes("NetworkError")) toast.error("Network error. Please check your connection.");
          else toast.error(error.message || "Signup failed");
          return;
        }
        if (formData.phoneNumber) localStorage.setItem("pendingPhoneNumber", formData.phoneNumber);
        if (formData.referralCode) localStorage.setItem("pendingReferralCode", formData.referralCode.toUpperCase());
        supabase.functions.invoke("send-welcome-email", { body: { email: formData.email, fullName: formData.fullName } }).catch(err => console.error("Welcome email error:", err));
        toast.success("Account created! Please check your email to verify your address, then login.");
        setIsLogin(true);
        setFormData(prev => ({ ...prev, password: "", confirmPassword: "" }));
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred.");
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

  const InputField = ({ icon: Icon, id, label, error, ...props }: any) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-gray-500">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          id={id}
          {...props}
          className={cn(
            "w-full h-12 pl-11 pr-4 bg-gray-50 border rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-sm",
            error ? "border-red-300 focus:ring-red-500" : "border-gray-200"
          )}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );

  const PasswordField = ({ id, label, value, onChange, show, onToggle, error, placeholder = "••••••••" }: any) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-gray-500">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={cn(
            "w-full h-12 pl-11 pr-12 bg-gray-50 border rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-sm",
            error ? "border-red-300 focus:ring-red-500" : "border-gray-200"
          )}
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600">
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Green Header */}
      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 px-6 pt-12 pb-16 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -left-8 top-16 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute right-6 bottom-2 w-20 h-20 rounded-full bg-white/5" />

        <div className="flex flex-col items-center relative z-10">
          <motion.img
            src={inkotaLogo}
            alt="INKOTA SUB"
            className="w-16 h-16 object-contain mb-3 rounded-2xl shadow-lg"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
          />
          <h1 className="text-2xl font-bold text-white">
            {isLogin && loginReady && !locked
              ? <>Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋</>
              : <>INKOTA<span className="text-white/80">SUB</span></>
            }
          </h1>
          <p className="text-white/70 text-sm mt-1">
            {isLogin ? "Sign in to your account" : "Create your account to get started"}
          </p>
        </div>
      </div>

      {/* Form Card */}
      <div className="px-4 -mt-8 max-w-md mx-auto relative z-10 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          {/* Tab Toggle */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
            <button
              onClick={() => { setIsLogin(true); setErrors({}); }}
              className={cn(
                "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
                isLogin ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              )}
            >
              Login
            </button>
            <button
              onClick={() => { setIsLogin(false); setErrors({}); }}
              className={cn(
                "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
                !isLogin ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              )}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="signup-fields"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3.5 overflow-hidden"
                >
                  <InputField icon={User} id="fullName" label="Full Name" placeholder="Enter your full name" value={formData.fullName} onChange={(e: any) => setFormData({ ...formData, fullName: e.target.value })} error={errors.fullName} />
                  <InputField icon={AtSign} id="username" label="Username" placeholder="Choose a username" value={formData.username} onChange={(e: any) => setFormData({ ...formData, username: e.target.value.replace(/\s/g, "").toLowerCase() })} error={errors.username} className="lowercase" />
                  <InputField icon={Phone} id="phoneNumber" label="Phone Number" type="tel" inputMode="numeric" placeholder="08012345678" value={formData.phoneNumber} onChange={(e: any) => setFormData({ ...formData, phoneNumber: e.target.value.replace(/[^\d+]/g, "").slice(0, 14) })} error={errors.phoneNumber} />
                  <InputField icon={Mail} id="email" label="Email Address" type="email" placeholder="you@example.com" value={formData.email} onChange={(e: any) => setFormData({ ...formData, email: e.target.value })} error={errors.email} />
                </motion.div>
              )}
            </AnimatePresence>

            {isLogin && (
              <>
                {loginWithEmail ? (
                  <InputField icon={Mail} id="loginEmail" label="Email Address" type="email" placeholder="you@example.com" value={formData.email} onChange={(e: any) => setFormData({ ...formData, email: e.target.value })} error={errors.email} />
                ) : (
                  <InputField icon={AtSign} id="loginUsername" label="Username" placeholder="Enter your username" value={formData.username} onChange={(e: any) => setFormData({ ...formData, username: e.target.value.replace(/\s/g, "").toLowerCase() })} error={errors.username} />
                )}
                <div className="flex justify-end">
                  <button type="button" onClick={() => { setLoginWithEmail(!loginWithEmail); setErrors({}); }} className="text-xs text-green-600 font-medium active:text-green-700">
                    {loginWithEmail ? "Use username instead" : "Use email instead"}
                  </button>
                </div>
              </>
            )}

            <PasswordField id="password" label="Password" value={formData.password} onChange={(e: any) => setFormData({ ...formData, password: e.target.value })} show={showPassword} onToggle={() => setShowPassword(!showPassword)} error={errors.password} />

            {!isLogin && (
              <PasswordField id="confirmPassword" label="Confirm Password" value={formData.confirmPassword} onChange={(e: any) => setFormData({ ...formData, confirmPassword: e.target.value })} show={showConfirmPassword} onToggle={() => setShowConfirmPassword(!showConfirmPassword)} error={errors.confirmPassword} />
            )}

            {!isLogin && (
              <InputField icon={Gift} id="referralCode" label="Referral Code (Optional)" placeholder="Enter referral code" value={formData.referralCode} onChange={(e: any) => setFormData({ ...formData, referralCode: e.target.value.toUpperCase() })} className="uppercase" />
            )}

            {isLogin && (
              <div className="flex justify-end">
                <button type="button" onClick={() => setShowForgotPassword(true)} className="text-xs text-gray-500 active:text-green-600">
                  Forgot password?
                </button>
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold text-sm shadow-lg shadow-green-500/25 active:from-green-700 active:to-green-600 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : isLogin ? "Login" : "Create Account"}
            </motion.button>
          </form>

          {/* Biometric Login */}
          {isLogin && loginReady && !locked && (
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
                      if (error) toast.error("Biometric login failed. Please use password.");
                      else toast.success("Welcome back!");
                    } else {
                      toast.error(result.error || "Fingerprint verification failed");
                    }
                  } finally {
                    setBiometricLoading(false);
                  }
                }}
                className="w-full h-12 rounded-xl border-2 border-gray-200 bg-white text-gray-700 font-medium text-sm flex items-center justify-center gap-3 active:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {biometricLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-green-500" />
                ) : (
                  <>
                    <svg className="h-5 w-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4" />
                      <path d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2" />
                      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
                      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
                      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
                      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
                      <path d="M2 16h.01" />
                      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
                      <path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2" />
                    </svg>
                    Login with Fingerprint
                  </>
                )}
              </motion.button>
            </div>
          )}

          {isLogin && locked && (
            <p className="mt-3 text-xs text-red-500 text-center">Fingerprint locked. Please login with password.</p>
          )}

          <div className="mt-5 text-center">
            <p className="text-sm text-gray-500">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <button type="button" onClick={() => { setIsLogin(!isLogin); setErrors({}); }} className="text-green-600 font-semibold active:text-green-700">
                {isLogin ? "Sign Up" : "Login"}
              </button>
            </p>
          </div>
        </motion.div>
      </div>

      <ForgotPasswordDialog open={showForgotPassword} onOpenChange={setShowForgotPassword} />
    </div>
  );
};

export default Auth;
