import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  User,
  Wallet,
  Shield,
  Bell,
  Palette,
  HelpCircle,
  Info,
  LogOut,
  ChevronRight,
  Moon,
  Sun,
  Lock,
  Fingerprint,
  CreditCard,
  History,
  MessageCircle,
  Mail,
  FileText,
  Phone,
  Settings as SettingsIcon,
  Globe,
  Building2,
  Smartphone,
} from "lucide-react";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useWallet } from "@/hooks/useWallet";
import { useVirtualAccount } from "@/hooks/useVirtualAccount";
import { supabase } from "@/integrations/supabase/client";
import { useBiometric } from "@/hooks/useBiometric";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SettingItem {
  icon: React.ElementType;
  label: string;
  description?: string;
  action?: () => void;
  toggle?: boolean;
  value?: boolean;
  onToggle?: (value: boolean) => void;
  badge?: string;
}

interface SettingsSection {
  title: string;
  icon: React.ElementType;
  items: SettingItem[];
}

const Settings = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { wallet } = useWallet();
  const { virtualAccount } = useVirtualAccount();
  const {
    available: biometricAvailable,
    loginEnabled: biometricLoginEnabled,
    transactionEnabled: biometricTransactionEnabled,
    enableBiometricLogin,
    disableBiometricLogin,
    toggleTransactionBiometric,
  } = useBiometric();

  // Preferences state
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [transactionAlerts, setTransactionAlerts] = useState(true);
  const [autoFundingNotifications, setAutoFundingNotifications] = useState(true);
  const [biometricSetupOpen, setBiometricSetupOpen] = useState(false);
  const [biometricEmail, setBiometricEmail] = useState("");
  const [biometricPassword, setBiometricPassword] = useState("");

  // Dialog states
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [pinChangeStep, setPinChangeStep] = useState<"confirm" | "otp" | "newpin" | "success">("confirm");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Support settings
  const [supportSettings, setSupportSettings] = useState({
    support_email: "inkotasub123@gmail.com",
    whatsapp_number: "+2349034226643",
    support_phone: "+2349034226643",
  });

  useEffect(() => {
    fetchSupportSettings();
  }, []);

  const fetchSupportSettings = async () => {
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["support_email", "whatsapp_number", "support_phone"]);

      if (data) {
        const settings: Record<string, string> = {};
        data.forEach((s) => {
          if (s.value) settings[s.key] = s.value;
        });
        setSupportSettings((prev) => ({ ...prev, ...settings }));
      }
    } catch (error) {
      console.error("Failed to fetch support settings:", error);
    }
  };

  const handleDarkModeToggle = (value: boolean) => {
    setDarkMode(value);
    if (value) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
    toast.success(`${value ? "Dark" : "Light"} mode enabled`);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully");
      setChangePasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    }
  };

  // Send OTP for PIN change
  const handleSendPinChangeOtp = async () => {
    if (!user?.email) {
      toast.error("No email found on your account");
      return;
    }
    setOtpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-otp", {
        body: { email: user.email, purpose: "reset_pin" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to send OTP");

      setMaskedEmail(data.masked_email || user.email);
      setPinChangeStep("otp");
      toast.success("OTP sent to your email");

      // Start cooldown
      setOtpResendCooldown(60);
      const interval = setInterval(() => {
        setOtpResendCooldown((prev) => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || "Failed to send OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyPinOtp = async () => {
    if (otpCode.length !== 6) {
      toast.error("Please enter the 6-digit OTP");
      return;
    }
    setOtpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-email-otp", {
        body: { email: user?.email, code: otpCode, purpose: "reset_pin" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Verification failed");

      setVerificationToken(data.verification_token);
      setPinChangeStep("newpin");
      toast.success("Email verified successfully");
    } catch (error: any) {
      toast.error(error.message || "Invalid or expired OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  // Change PIN with OTP verification token
  const handleChangePin = async () => {
    if (newPin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }
    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      toast.error("PIN must be 4 digits");
      return;
    }

    const hasExistingPin = !!profile?.has_transaction_pin;
    
    try {
      const body = hasExistingPin
        ? { action: "change_with_otp", new_pin: newPin, verification_token: verificationToken }
        : { action: "set", new_pin: newPin };

      const { data, error } = await supabase.functions.invoke("manage-pin", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      setPinChangeStep("success");
      toast.success(data?.message || "Transaction PIN updated successfully");
      setTimeout(() => {
        resetPinDialog();
      }, 1500);
    } catch (error: any) {
      toast.error(error.message || "Failed to update PIN");
    }
  };

  const resetPinDialog = () => {
    setChangePinOpen(false);
    setPinChangeStep("confirm");
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setOtpCode("");
    setVerificationToken("");
    setMaskedEmail("");
  };

  const handleOpenChangePinDialog = () => {
    if (profile?.has_transaction_pin) {
      setPinChangeStep("confirm");
    } else {
      setPinChangeStep("newpin");
    }
    setChangePinOpen(true);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
    toast.success("Logged out successfully");
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const sections: SettingsSection[] = [
    {
      title: "Account Settings",
      icon: User,
      items: [
        {
          icon: User,
          label: "Edit Profile",
          description: "Update your name, email, and phone",
          action: () => navigate("/profile"),
        },
        {
          icon: Lock,
          label: "Change Password",
          description: "Update your login password",
          action: () => setChangePasswordOpen(true),
        },
        {
          icon: Shield,
          label: "Transaction PIN",
          description: "Set or change your transaction PIN",
          action: () => handleOpenChangePinDialog(),
        },
        {
          icon: Fingerprint,
          label: "Biometric Login",
          description: biometricAvailable
            ? biometricLoginEnabled ? "Fingerprint login is active" : "Enable fingerprint login"
            : "Not available on this device",
          toggle: biometricAvailable,
          value: biometricLoginEnabled,
          onToggle: async (value) => {
            if (value) {
              setBiometricSetupOpen(true);
            } else {
              await disableBiometricLogin();
              toast.success("Biometric login disabled");
            }
          },
        },
        {
          icon: Fingerprint,
          label: "Fingerprint for Transactions",
          description: biometricAvailable
            ? biometricTransactionEnabled ? "Use fingerprint instead of PIN" : "Enable for transactions"
            : "Not available on this device",
          toggle: biometricAvailable,
          value: biometricTransactionEnabled,
          onToggle: async (value) => {
            const result = await toggleTransactionBiometric(value);
            if (result?.success) {
              toast.success(value ? "Fingerprint enabled for transactions" : "Fingerprint disabled for transactions");
            } else if (result?.error) {
              toast.error(result.error);
            }
          },
        },
      ],
    },
    {
      title: "Wallet & Payments",
      icon: Wallet,
      items: [
        {
          icon: Wallet,
          label: "Wallet Balance",
          description: formatCurrency(wallet?.balance || 0),
          action: () => navigate("/fund-wallet"),
        },
        {
          icon: Building2,
          label: "Virtual Account",
          description: virtualAccount?.account_number || "Not available",
          action: () => navigate("/fund-wallet"),
        },
        {
          icon: History,
          label: "Transaction History",
          description: "View all your transactions",
          action: () => navigate("/history"),
        },
        {
          icon: Bell,
          label: "Auto-Funding Notifications",
          description: "Get notified when wallet is funded",
          toggle: true,
          value: autoFundingNotifications,
          onToggle: (value) => {
            setAutoFundingNotifications(value);
            toast.success(value ? "Notifications enabled" : "Notifications disabled");
          },
        },
      ],
    },
    {
      title: "Security",
      icon: Shield,
      items: [
        {
          icon: Smartphone,
          label: "My Devices",
          description: "Manage linked devices",
          action: () => navigate("/my-devices"),
        },
        {
          icon: Lock,
          label: "Change Transaction PIN",
          description: "Update your 4-digit PIN",
          action: () => handleOpenChangePinDialog(),
        },
        {
          icon: Shield,
          label: "Two-Factor Authentication",
          description: "Add extra security layer",
          badge: "Coming Soon",
        },
        {
          icon: LogOut,
          label: "Logout from All Devices",
          description: "End all active sessions",
          action: async () => {
            await supabase.auth.signOut({ scope: "global" });
            navigate("/auth");
            toast.success("Logged out from all devices");
          },
        },
      ],
    },
    {
      title: "Notifications",
      icon: Bell,
      items: [
        {
          icon: Bell,
          label: "Push Notifications",
          description: "Receive push notifications",
          toggle: true,
          value: pushNotifications,
          onToggle: async (value) => {
            if (value && "Notification" in window) {
              const permission = await Notification.requestPermission();
              if (permission !== "granted") {
                toast.error("Please enable notifications in your browser settings");
                return;
              }
            }
            setPushNotifications(value);
            toast.success(value ? "Push notifications enabled" : "Push notifications disabled");
          },
        },
        {
          icon: Mail,
          label: "Email Alerts",
          description: "Receive email notifications",
          toggle: true,
          value: emailAlerts,
          onToggle: (value) => {
            setEmailAlerts(value);
            toast.success(value ? "Email alerts enabled" : "Email alerts disabled");
          },
        },
        {
          icon: CreditCard,
          label: "Transaction Alerts",
          description: "Get notified for all transactions",
          toggle: true,
          value: transactionAlerts,
          onToggle: (value) => {
            setTransactionAlerts(value);
            toast.success(value ? "Transaction alerts enabled" : "Transaction alerts disabled");
          },
        },
      ],
    },
    {
      title: "App Preferences",
      icon: Palette,
      items: [
        {
          icon: darkMode ? Moon : Sun,
          label: "Dark Mode",
          description: "Switch between light and dark theme",
          toggle: true,
          value: darkMode,
          onToggle: handleDarkModeToggle,
        },
        {
          icon: Globe,
          label: "Language",
          description: "English",
          badge: "Default",
        },
        {
          icon: CreditCard,
          label: "Currency",
          description: "Nigerian Naira (₦ NGN)",
          badge: "Default",
        },
      ],
    },
    {
      title: "Support & Legal",
      icon: HelpCircle,
      items: [
        {
          icon: MessageCircle,
          label: "Contact Support",
          description: supportSettings.support_email,
          action: () => navigate("/support"),
        },
        {
          icon: HelpCircle,
          label: "FAQ",
          description: "Frequently asked questions",
          action: () => navigate("/faq"),
        },
        {
          icon: FileText,
          label: "Privacy Policy",
          description: "Read our privacy policy",
          action: () => navigate("/privacy-policy"),
        },
        {
          icon: FileText,
          label: "Terms & Conditions",
          description: "Read our terms of service",
          action: () => navigate("/terms"),
        },
        {
          icon: FileText,
          label: "Refund Policy",
          description: "Our refund guidelines",
          action: () => navigate("/refund-policy"),
        },
      ],
    },
    {
      title: "About App",
      icon: Info,
      items: [
        {
          icon: SettingsIcon,
          label: "App Version",
          description: "v1.0.0",
        },
        {
          icon: Building2,
          label: "Company",
          description: "INKOTA SUB Technologies",
        },
        {
          icon: Phone,
          label: "Contact",
          description: supportSettings.support_phone,
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen gradient-hero pb-24">
      <Header />

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
              <SettingsIcon className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          {/* Settings Sections */}
          {sections.map((section, sectionIndex) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sectionIndex * 0.05 }}
            >
              <Card className="glass-card border-0 overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <section.icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{section.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50">
                    {section.items.map((item, itemIndex) => (
                      <div
                        key={item.label}
                        className={`flex items-center justify-between p-4 ${
                          item.action ? "cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors" : ""
                        }`}
                        onClick={item.action}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            <item.icon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground">{item.label}</p>
                            {item.description && (
                              <p className="text-sm text-muted-foreground truncate">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>
                        {item.badge && (
                          <span className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-full mr-2">
                            {item.badge}
                          </span>
                        )}
                        {item.toggle ? (
                          <Switch
                            checked={item.value}
                            onCheckedChange={item.onToggle}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : item.action ? (
                          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}

          {/* Logout Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full h-14 rounded-xl text-base font-semibold"
              >
                <LogOut className="h-5 w-5 mr-2" />
                Logout
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to logout? You'll need to sign in again to access your account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>Logout</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </motion.div>
      </main>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your new password. It must be at least 6 characters.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePasswordOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword}>Update Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change PIN Dialog */}
      <Dialog open={changePinOpen} onOpenChange={setChangePinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{profile?.has_transaction_pin ? "Change" : "Set"} Transaction PIN</DialogTitle>
            <DialogDescription>
              {profile?.has_transaction_pin
                ? "Enter your current PIN and set a new 4-digit PIN."
                : "Enter a 4-digit PIN to secure your transactions."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {profile?.has_transaction_pin && (
              <div className="space-y-2">
                <Label htmlFor="currentPin">Current PIN</Label>
                <Input
                  id="currentPin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter current PIN"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="newPin">New PIN</Label>
              <Input
                id="newPin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter 4-digit PIN"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPin">Confirm PIN</Label>
              <Input
                id="confirmPin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                placeholder="Confirm 4-digit PIN"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePinOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePin}>
              {profile?.has_transaction_pin ? "Update" : "Set"} PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Biometric Setup Dialog */}
      <Dialog open={biometricSetupOpen} onOpenChange={setBiometricSetupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-primary" />
              Enable Fingerprint Login
            </DialogTitle>
            <DialogDescription>
              Enter your login credentials to link fingerprint authentication to this device. Your credentials will be stored securely in encrypted storage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="biometricEmail">Email</Label>
              <Input
                id="biometricEmail"
                type="email"
                value={biometricEmail}
                onChange={(e) => setBiometricEmail(e.target.value)}
                placeholder="Your login email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="biometricPassword">Password</Label>
              <Input
                id="biometricPassword"
                type="password"
                value={biometricPassword}
                onChange={(e) => setBiometricPassword(e.target.value)}
                placeholder="Your login password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBiometricSetupOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!biometricEmail || !biometricPassword) {
                  toast.error("Please enter your credentials");
                  return;
                }
                const result = await enableBiometricLogin(biometricEmail, biometricPassword);
                if (result.success) {
                  toast.success("Fingerprint login enabled! You can now login with your fingerprint.");
                  setBiometricSetupOpen(false);
                  setBiometricEmail("");
                  setBiometricPassword("");
                } else {
                  toast.error(result.error || "Failed to enable fingerprint login");
                }
              }}
            >
              Enable Fingerprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default Settings;
