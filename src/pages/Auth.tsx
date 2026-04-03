import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { useBiometric } from "@/hooks/useBiometric";
import { storeCredentials } from "@/lib/biometric";
import inkotaLogo from "@/assets/inkota-logo.png";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

const Auth = () => {
  const navigate = useNavigate();
  const { user, signIn, signUp, isLoading, isAdmin, profile } = useAuth();
  const { loginReady, biometricLogin, locked } = useBiometric();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    phoneNumber: "",
    referralCode: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode) {
      setFormData((prev) => ({ ...prev, referralCode: refCode }));
      setIsLogin(false);
    }
  }, []);

  useEffect(() => {
    if (user && !isLoading) {
      navigate(isAdmin ? "/admin" : "/dashboard");
    }
  }, [user, isLoading, isAdmin, navigate]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    try { emailSchema.parse(formData.email); } catch (e) {
      if (e instanceof z.ZodError) newErrors.email = e.errors[0].message;
    }
    try { passwordSchema.parse(formData.password); } catch (e) {
      if (e instanceof z.ZodError) newErrors.password = e.errors[0].message;
    }
    if (!isLogin) {
      if (!formData.fullName.trim()) newErrors.fullName = "Full name is required";
      if (!formData.phoneNumber.trim() || formData.phoneNumber.replace(/\D/g, "").length < 10) {
        newErrors.phoneNumber = "Please enter a valid phone number";
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn(formData.email, formData.password);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error("Invalid email or password");
          } else if (error.message.includes("Email not confirmed")) {
            toast.error("Please verify your email address first");
          } else if (error.message === "Failed to fetch" || error.message.includes("NetworkError")) {
            toast.error("Network error. Please check your connection.");
          } else {
            toast.error(error.message || "Login failed");
          }
          return;
        }
        toast.success(`Welcome back, ${profile?.full_name?.split(" ")[0] || ""}! 👋`);
        await storeCredentials(formData.email, formData.password);
      } else {
        // Signup
        const { error } = await signUp(formData.email, formData.password, formData.fullName);
        if (error) {
          if (error.message.includes("already registered")) {
            toast.error("This email is already registered. Please login instead.");
          } else {
            toast.error(error.message || "Signup failed");
          }
          return;
        }

        // Update phone number in profile after signup
        // The profile is auto-created by trigger, we'll update phone on next login
        if (formData.phoneNumber) {
          localStorage.setItem("pendingPhoneNumber", formData.phoneNumber);
        }

        if (formData.referralCode) {
          localStorage.setItem("pendingReferralCode", formData.referralCode.toUpperCase());
        }

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
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <motion.img
              src={inkotaLogo}
              alt="INKOTA SUB"
              className="w-20 h-20 object-contain"
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            INKOTA<span className="text-primary">SUB</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            {isLogin ? "Welcome back! Sign in to continue" : "Create your account to get started"}
          </p>
        </div>

        <div className="glass-card rounded-3xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="pl-10 h-12 rounded-xl"
                    />
                  </div>
                  {errors.fullName && <p className="text-sm text-destructive">{errors.fullName}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="phoneNumber"
                      type="tel"
                      inputMode="numeric"
                      placeholder="08012345678"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value.replace(/[^\d+]/g, "").slice(0, 14) })}
                      className="pl-10 h-12 rounded-xl"
                    />
                  </div>
                  {errors.phoneNumber && <p className="text-sm text-destructive">{errors.phoneNumber}</p>}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="pl-10 h-12 rounded-xl"
                />
              </div>
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="pl-10 pr-10 h-12 rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="pl-10 pr-10 h-12 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
              </div>
            )}

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="referralCode">Referral Code (Optional)</Label>
                <Input
                  id="referralCode"
                  type="text"
                  placeholder="Enter referral code"
                  value={formData.referralCode}
                  onChange={(e) => setFormData({ ...formData, referralCode: e.target.value.toUpperCase() })}
                  className="h-12 rounded-xl uppercase"
                />
              </div>
            )}

            {isLogin && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isLogin ? (
                "Login"
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          {isLogin && loginReady && !locked && (
            <div className="mt-4">
              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-border flex-1" />
                <span className="px-3 text-xs text-muted-foreground">or</span>
                <div className="border-t border-border flex-1" />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={biometricLoading}
                onClick={async () => {
                  setBiometricLoading(true);
                  try {
                    const result = await biometricLogin();
                    if (result.success && result.email && result.password) {
                      const { error } = await signIn(result.email, result.password);
                      if (error) {
                        toast.error("Biometric login failed. Please use password.");
                      } else {
                        toast.success("Welcome back!");
                      }
                    } else {
                      toast.error(result.error || "Fingerprint verification failed");
                    }
                  } finally {
                    setBiometricLoading(false);
                  }
                }}
                className="w-full h-12 rounded-xl gap-3 border-primary/30"
              >
                {biometricLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              </Button>
            </div>
          )}

          {isLogin && locked && (
            <p className="mt-3 text-xs text-destructive text-center">
              Fingerprint locked. Please login with password.
            </p>
          )}

          <div className="mt-6 text-center">
            <p className="text-muted-foreground">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setErrors({});
                }}
                className="text-primary font-semibold hover:underline"
              >
                {isLogin ? "Create Account" : "Login"}
              </button>
            </p>
          </div>
        </div>
      </motion.div>

      <ForgotPasswordDialog
        open={showForgotPassword}
        onOpenChange={setShowForgotPassword}
      />
    </div>
  );
};

export default Auth;
