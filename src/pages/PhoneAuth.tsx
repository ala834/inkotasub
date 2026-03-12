import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Lock, User, ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import OTPInput from "@/components/auth/OTPInput";
import inkotaLogo from "@/assets/inkota-logo.png";

type AuthStep = "phone" | "otp" | "password" | "login";
type AuthMode = "signup" | "signin" | "reset";

const PhoneAuth = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [step, setStep] = useState<AuthStep>("phone");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const [maskedPhone, setMaskedPhone] = useState("");
  const [otpExpiry, setOtpExpiry] = useState(0);
  const [isTestMode, setIsTestMode] = useState(false);
  const [testOtpCode, setTestOtpCode] = useState("");

  // Check for referral code in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode) {
      setReferralCode(refCode.toUpperCase());
      setMode("signup");
    }
  }, []);

  useEffect(() => {
    if (user && !authLoading) {
      navigate("/dashboard");
    }
  }, [user, authLoading, navigate]);

  // OTP expiry countdown
  useEffect(() => {
    if (otpExpiry > 0) {
      const timer = setInterval(() => {
        setOtpExpiry((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [otpExpiry]);

  const formatPhoneDisplay = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("234") && cleaned.length >= 13) {
      return `+${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}`;
    }
    if (cleaned.startsWith("0") && cleaned.length >= 11) {
      return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
    }
    return phone;
  };

  const handleSendOTP = async () => {
    if (!phoneNumber || phoneNumber.replace(/\D/g, "").length < 10) {
      toast.error("Please enter a valid Nigerian phone number");
      return;
    }

    setLoading(true);
    try {
      const purpose = mode === "reset" ? "reset_pin" : "verification";
      
      const { data, error } = await supabase.functions.invoke("send-otp", {
        body: { phoneNumber, purpose },
      });

      if (error) throw error;
      if (!data.success) {
        toast.error(data.error || "Failed to send OTP");
        return;
      }

      setMaskedPhone(data.masked_phone);
      setOtpExpiry(data.expires_in);
      setIsTestMode(data.is_test);

      if (data.is_test && data.message.includes("use code:")) {
        const codeMatch = data.message.match(/use code: (\d+)/);
        if (codeMatch) {
          setTestOtpCode(codeMatch[1]);
        }
      }

      toast.success(data.message);
      setStep("otp");
    } catch (error) {
      console.error("Send OTP error:", error);
      toast.error("Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      toast.error("Please enter the complete 6-digit code");
      return;
    }

    setLoading(true);
    try {
      const purpose = mode === "reset" ? "reset_pin" : "verification";

      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: { phoneNumber, code: otp, purpose },
      });

      if (error) throw error;
      if (!data.success) {
        toast.error(data.error || "Invalid OTP");
        return;
      }

      setVerificationToken(data.verification_token);
      toast.success("Phone verified successfully!");

      if (mode === "signin") {
        setStep("login");
      } else {
        setStep("password");
      }
    } catch (error) {
      console.error("Verify OTP error:", error);
      toast.error("Failed to verify OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!fullName.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("phone-auth", {
        body: {
          action: "signup",
          phoneNumber,
          password,
          fullName,
          verificationToken,
          referralCode: referralCode || undefined,
        },
      });

      if (error) throw error;
      if (!data.success) {
        toast.error(data.error || "Failed to create account");
        return;
      }

      if (data.session) {
        await supabase.auth.setSession(data.session);
        toast.success("Account created successfully!");
        navigate("/dashboard");
      } else if (data.require_login) {
        toast.success(data.message);
        setMode("signin");
        setStep("phone");
      }
    } catch (error) {
      console.error("Sign up error:", error);
      toast.error("Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (password.length < 6) {
      toast.error("Please enter your password");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("phone-auth", {
        body: { action: "signin", phoneNumber, password },
      });

      if (error) throw error;
      if (!data.success) {
        console.error("Sign in failed:", data.error);
        toast.error(data.error || "Invalid credentials");
        return;
      }

      if (data.session) {
        await supabase.auth.setSession(data.session);
        toast.success("Welcome back!");
        
        // Redirect based on admin status
        if (data.is_admin) {
          navigate("/admin");
        } else {
          navigate("/dashboard");
        }
      }
    } catch (error) {
      console.error("Sign in error:", error);
      toast.error("Failed to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("phone-auth", {
        body: {
          action: "reset_password",
          phoneNumber,
          newPassword: password,
          verificationToken,
        },
      });

      if (error) throw error;
      if (!data.success) {
        toast.error(data.error || "Failed to reset password");
        return;
      }

      toast.success(data.message);
      setMode("signin");
      setStep("phone");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Reset password error:", error);
      toast.error("Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === "otp") {
      setStep("phone");
      setOtp("");
    } else if (step === "password" || step === "login") {
      setStep("otp");
      setPassword("");
      setConfirmPassword("");
    }
  };

  const resetFlow = () => {
    setStep("phone");
    setPhoneNumber("");
    setOtp("");
    setPassword("");
    setConfirmPassword("");
    setFullName("");
    setVerificationToken("");
    setOtpExpiry(0);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
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
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <motion.img src={inkotaLogo} alt="INKOTA SUB" className="w-20 h-20 object-contain" animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            INKOTA<span className="text-primary">SUB</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            {mode === "signup" && "Create your account"}
            {mode === "signin" && "Welcome back!"}
            {mode === "reset" && "Reset your password"}
          </p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-3xl p-6">
          <AnimatePresence mode="wait">
            {/* Phone Number Step */}
            {step === "phone" && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="0803 456 7890"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="pl-10 h-12 rounded-xl text-lg"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter your Nigerian phone number
                  </p>
                </div>

                <Button
                  onClick={handleSendOTP}
                  disabled={loading}
                  className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Send OTP"
                  )}
                </Button>

                {mode !== "reset" && (
                  <div className="text-center pt-4 space-y-3">
                    <p className="text-muted-foreground">
                      {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setMode(mode === "signin" ? "signup" : "signin");
                          resetFlow();
                        }}
                        className="text-primary font-semibold hover:underline"
                      >
                        {mode === "signin" ? "Sign up" : "Sign in"}
                      </button>
                    </p>
                    {mode === "signin" && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setMode("reset");
                          }}
                          className="text-sm text-muted-foreground hover:text-primary block mx-auto"
                        >
                          Forgot password?
                        </button>
                        <div className="border-t border-border pt-3">
                          <p className="text-sm text-muted-foreground">
                            Registered with email?{" "}
                            <button
                              type="button"
onClick={() => navigate("/auth/email")}
                              className="text-primary font-semibold hover:underline"
                            >
                              Login with Email
                            </button>
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* OTP Step */}
            {step === "otp" && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>

                <div className="text-center">
                  <h2 className="text-lg font-semibold">Verify your phone</h2>
                  <p className="text-sm text-muted-foreground">
                    Enter the 6-digit code sent to {maskedPhone}
                  </p>
                  {isTestMode && testOtpCode && (
                    <p className="text-xs text-primary mt-1">
                      Test mode: Use code <span className="font-mono font-bold">{testOtpCode}</span>
                    </p>
                  )}
                </div>

                <OTPInput value={otp} onChange={setOtp} length={6} />

                {otpExpiry > 0 && (
                  <p className="text-center text-sm text-muted-foreground">
                    Code expires in {Math.floor(otpExpiry / 60)}:{(otpExpiry % 60).toString().padStart(2, "0")}
                  </p>
                )}

                <Button
                  onClick={handleVerifyOTP}
                  disabled={loading || otp.length !== 6}
                  className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Verify"
                  )}
                </Button>

                {otpExpiry === 0 && (
                  <button
                    onClick={handleSendOTP}
                    disabled={loading}
                    className="w-full text-sm text-primary hover:underline"
                  >
                    Resend OTP
                  </button>
                )}
              </motion.div>
            )}

            {/* Password Setup Step (Signup/Reset) */}
            {step === "password" && (
              <motion.div
                key="password"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>

                <div className="text-center">
                  <h2 className="text-lg font-semibold">
                    {mode === "reset" ? "Set new password" : "Complete your profile"}
                  </h2>
                </div>

                {mode === "signup" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          id="fullName"
                          type="text"
                          placeholder="John Doe"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="pl-10 h-12 rounded-xl"
                        />
                      </div>
                    </div>

                    {referralCode && (
                      <div className="space-y-2">
                        <Label htmlFor="referral">Referral Code</Label>
                        <Input
                          id="referral"
                          type="text"
                          value={referralCode}
                          disabled
                          className="h-12 rounded-xl bg-muted"
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">
                    {mode === "reset" ? "New Password" : "Password"}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-12 rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 h-12 rounded-xl"
                    />
                  </div>
                </div>

                <Button
                  onClick={mode === "reset" ? handleResetPassword : handleSignUp}
                  disabled={loading}
                  className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : mode === "reset" ? (
                    "Reset Password"
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </motion.div>
            )}

            {/* Login Step (for existing users) */}
            {step === "login" && (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center">
                  <h2 className="text-lg font-semibold">Enter your password</h2>
                  <p className="text-sm text-muted-foreground">
                    Signing in as {formatPhoneDisplay(phoneNumber)}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loginPassword">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="loginPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-12 rounded-xl"
                      onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handleSignIn}
                  disabled={loading}
                  className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Sign In"
                  )}
                </Button>

                <button
                  onClick={() => {
                    setMode("reset");
                    setStep("phone");
                    setPassword("");
                  }}
                  className="w-full text-sm text-muted-foreground hover:text-primary"
                >
                  Forgot password?
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default PhoneAuth;
