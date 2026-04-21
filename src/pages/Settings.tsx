import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  User, Wallet, Shield, Bell, Palette, HelpCircle, Info, LogOut, ChevronRight,
  Moon, Sun, Lock, Fingerprint, CreditCard, History, MessageCircle, Mail,
  FileText, Phone, Settings as SettingsIcon, Globe, Building2, Smartphone, ArrowLeft, Loader2, Code2
} from "lucide-react";
import BottomNav from "@/components/layout/BottomNav";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useWallet } from "@/hooks/useWallet";
import { useVirtualAccount } from "@/hooks/useVirtualAccount";
import { supabase } from "@/integrations/supabase/client";
import { useBiometric } from "@/hooks/useBiometric";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface SettingItem {
  icon: React.ElementType;
  label: string;
  description?: string;
  action?: () => void;
  toggle?: boolean;
  value?: boolean;
  onToggle?: (value: boolean) => void;
  badge?: string;
  iconColor?: string;
}

interface SettingsSection {
  title: string;
  items: SettingItem[];
}

const Settings = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { wallet } = useWallet();
  const { virtualAccount } = useVirtualAccount();
  const {
    available: biometricAvailable, loginEnabled: biometricLoginEnabled,
    transactionEnabled: biometricTransactionEnabled,
    enableBiometricLogin, disableBiometricLogin, toggleTransactionBiometric,
  } = useBiometric();

  const [darkMode, setDarkMode] = useState(() => typeof window !== "undefined" && document.documentElement.classList.contains("dark"));
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [transactionAlerts, setTransactionAlerts] = useState(true);
  const [autoFundingNotifications, setAutoFundingNotifications] = useState(true);
  const [biometricSetupOpen, setBiometricSetupOpen] = useState(false);
  const [biometricEmail, setBiometricEmail] = useState("");
  const [biometricPassword, setBiometricPassword] = useState("");

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

  const [supportSettings, setSupportSettings] = useState({
    support_email: "inkotasub123@gmail.com",
    whatsapp_number: "+2349034226643",
    support_phone: "+2349034226643",
  });

  useEffect(() => { fetchSupportSettings(); }, []);

  const fetchSupportSettings = async () => {
    try {
      const { data } = await supabase.from("app_settings").select("key, value").in("key", ["support_email", "whatsapp_number", "support_phone"]);
      if (data) {
        const settings: Record<string, string> = {};
        data.forEach(s => { if (s.value) settings[s.key] = s.value; });
        setSupportSettings(prev => ({ ...prev, ...settings }));
      }
    } catch (error) { console.error("Failed to fetch support settings:", error); }
  };

  const handleDarkModeToggle = (value: boolean) => {
    setDarkMode(value);
    if (value) { document.documentElement.classList.add("dark"); localStorage.setItem("theme", "dark"); }
    else { document.documentElement.classList.remove("dark"); localStorage.setItem("theme", "light"); }
    toast.success(`${value ? "Dark" : "Light"} mode enabled`);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully");
      setChangePasswordOpen(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (error: any) { toast.error(error.message || "Failed to update password"); }
  };

  const handleSendPinChangeOtp = async () => {
    if (!user?.email) { toast.error("No email found"); return; }
    setOtpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-otp", { body: { email: user.email, purpose: "reset_pin" } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to send OTP");
      setMaskedEmail(data.masked_email || user.email);
      setPinChangeStep("otp");
      toast.success("OTP sent to your email");
      setOtpResendCooldown(60);
      const interval = setInterval(() => { setOtpResendCooldown(prev => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; }); }, 1000);
    } catch (error: any) { toast.error(error.message || "Failed to send OTP"); }
    finally { setOtpLoading(false); }
  };

  const handleVerifyPinOtp = async () => {
    if (otpCode.length !== 6) { toast.error("Please enter the 6-digit OTP"); return; }
    setOtpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-email-otp", { body: { email: user?.email, code: otpCode, purpose: "reset_pin" } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Verification failed");
      setVerificationToken(data.verification_token);
      setPinChangeStep("newpin");
      toast.success("Email verified");
    } catch (error: any) { toast.error(error.message || "Invalid or expired OTP"); }
    finally { setOtpLoading(false); }
  };

  const handleChangePin = async () => {
    if (newPin !== confirmPin) { toast.error("PINs do not match"); return; }
    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) { toast.error("PIN must be 4 digits"); return; }
    const hasExistingPin = !!profile?.has_transaction_pin;
    try {
      const body = hasExistingPin
        ? { action: "change_with_otp", new_pin: newPin, verification_token: verificationToken }
        : { action: "set", new_pin: newPin };
      const { data, error } = await supabase.functions.invoke("manage-pin", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPinChangeStep("success");
      toast.success(data?.message || "Transaction PIN updated");
      setTimeout(() => resetPinDialog(), 1500);
    } catch (error: any) { toast.error(error.message || "Failed to update PIN"); }
  };

  const resetPinDialog = () => {
    setChangePinOpen(false); setPinChangeStep("confirm"); setCurrentPin(""); setNewPin("");
    setConfirmPin(""); setOtpCode(""); setVerificationToken(""); setMaskedEmail("");
  };

  const handleOpenChangePinDialog = () => {
    if (profile?.has_transaction_pin) setPinChangeStep("confirm");
    else setPinChangeStep("newpin");
    setChangePinOpen(true);
  };

  const handleLogout = async () => {
    await signOut(); navigate("/auth"); toast.success("Logged out successfully");
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(amount);

  const sections: SettingsSection[] = [
    {
      title: "Account",
      items: [
        { icon: User, label: "Edit Profile", description: "Name, email, and phone", action: () => navigate("/profile"), iconColor: "text-blue-500 bg-blue-50" },
        { icon: Lock, label: "Change Password", description: "Update login password", action: () => setChangePasswordOpen(true), iconColor: "text-purple-500 bg-purple-50" },
        { icon: Shield, label: "Transaction PIN", description: profile?.has_transaction_pin ? "Change your PIN" : "Set up your PIN", action: () => handleOpenChangePinDialog(), iconColor: "text-green-500 bg-green-50" },
        { icon: Fingerprint, label: "Biometric Login", description: biometricAvailable ? (biometricLoginEnabled ? "Active" : "Enable fingerprint") : "Not available", toggle: biometricAvailable, value: biometricLoginEnabled, onToggle: async v => { if (v) setBiometricSetupOpen(true); else { await disableBiometricLogin(); toast.success("Biometric disabled"); } }, iconColor: "text-emerald-500 bg-emerald-50" },
        { icon: Fingerprint, label: "Fingerprint for Transactions", description: biometricAvailable ? (biometricTransactionEnabled ? "Active" : "Use fingerprint for PIN") : "Not available", toggle: biometricAvailable, value: biometricTransactionEnabled, onToggle: async v => { const r = await toggleTransactionBiometric(v); if (r?.success) toast.success(v ? "Enabled" : "Disabled"); else if (r?.error) toast.error(r.error); }, iconColor: "text-teal-500 bg-teal-50" },
      ],
    },
    {
      title: "Wallet & Payments",
      items: [
        { icon: Wallet, label: "Wallet Balance", description: formatCurrency(wallet?.balance || 0), action: () => navigate("/fund-wallet"), iconColor: "text-green-600 bg-green-50" },
        { icon: Building2, label: "Virtual Account", description: virtualAccount?.account_number || "Not linked", action: () => navigate("/fund-wallet"), iconColor: "text-indigo-500 bg-indigo-50" },
        { icon: History, label: "Transaction History", description: "View all transactions", action: () => navigate("/history"), iconColor: "text-blue-500 bg-blue-50" },
        { icon: Bell, label: "Auto-Funding Alerts", toggle: true, value: autoFundingNotifications, onToggle: v => { setAutoFundingNotifications(v); toast.success(v ? "Enabled" : "Disabled"); }, iconColor: "text-amber-500 bg-amber-50" },
      ],
    },
    {
      title: "Security",
      items: [
        { icon: Smartphone, label: "My Devices", description: "Manage linked devices", action: () => navigate("/my-devices"), iconColor: "text-slate-600 bg-slate-50" },
        { icon: Shield, label: "Two-Factor Auth", badge: "Coming Soon", iconColor: "text-orange-500 bg-orange-50" },
        { icon: LogOut, label: "Logout All Devices", description: "End all sessions", action: async () => { await supabase.auth.signOut({ scope: "global" }); navigate("/auth"); toast.success("Logged out from all devices"); }, iconColor: "text-red-500 bg-red-50" },
      ],
    },
    {
      title: "Notifications",
      items: [
        { icon: Bell, label: "Push Notifications", toggle: true, value: pushNotifications, onToggle: async v => { if (v && "Notification" in window) { const p = await Notification.requestPermission(); if (p !== "granted") { toast.error("Enable in browser settings"); return; } } setPushNotifications(v); toast.success(v ? "Enabled" : "Disabled"); }, iconColor: "text-green-500 bg-green-50" },
        { icon: Mail, label: "Email Alerts", toggle: true, value: emailAlerts, onToggle: v => { setEmailAlerts(v); toast.success(v ? "Enabled" : "Disabled"); }, iconColor: "text-blue-500 bg-blue-50" },
        { icon: CreditCard, label: "Transaction Alerts", toggle: true, value: transactionAlerts, onToggle: v => { setTransactionAlerts(v); toast.success(v ? "Enabled" : "Disabled"); }, iconColor: "text-purple-500 bg-purple-50" },
      ],
    },
    {
      title: "Preferences",
      items: [
        { icon: darkMode ? Moon : Sun, label: "Dark Mode", toggle: true, value: darkMode, onToggle: handleDarkModeToggle, iconColor: darkMode ? "text-yellow-500 bg-yellow-50" : "text-gray-600 bg-gray-100" },
        { icon: Globe, label: "Language", description: "English", badge: "Default", iconColor: "text-cyan-500 bg-cyan-50" },
        { icon: CreditCard, label: "Currency", description: "₦ NGN", badge: "Default", iconColor: "text-green-500 bg-green-50" },
      ],
    },
    {
      title: "Advanced",
      items: [
        { icon: Code2, label: "Developer API", description: "Access API keys and developer tools", action: () => navigate("/developer"), iconColor: "text-violet-500 bg-violet-50" },
      ],
    },
    {
      title: "Support & Legal",
      items: [
        { icon: MessageCircle, label: "Contact Support", description: supportSettings.support_email, action: () => navigate("/support"), iconColor: "text-green-500 bg-green-50" },
        { icon: HelpCircle, label: "FAQ", action: () => navigate("/faq"), iconColor: "text-blue-500 bg-blue-50" },
        { icon: FileText, label: "Privacy Policy", action: () => navigate("/privacy-policy"), iconColor: "text-gray-500 bg-gray-100" },
        { icon: FileText, label: "Terms & Conditions", action: () => navigate("/terms"), iconColor: "text-gray-500 bg-gray-100" },
        { icon: FileText, label: "Refund Policy", action: () => navigate("/refund-policy"), iconColor: "text-gray-500 bg-gray-100" },
      ],
    },
    {
      title: "About",
      items: [
        { icon: SettingsIcon, label: "App Version", description: "v1.0.0", iconColor: "text-gray-500 bg-gray-100" },
        { icon: Building2, label: "Company", description: "INKOTA SUB Technologies", iconColor: "text-gray-500 bg-gray-100" },
        { icon: Phone, label: "Contact", description: supportSettings.support_phone, iconColor: "text-gray-500 bg-gray-100" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Green Header */}
      <header className="bg-gradient-to-r from-green-600 to-green-500 px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Settings</h1>
        <div className="w-10" />
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto space-y-4">
        {/* User Card */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate("/profile")}
          className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 active:bg-gray-50 transition-colors text-left"
        >
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
            <User className="h-6 w-6 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900">{profile?.full_name || "User"}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </motion.button>

        {/* Settings Sections */}
        {sections.map((section, sectionIndex) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 + sectionIndex * 0.02 }}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="px-4 pt-3 pb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{section.title}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {section.items.map(item => (
                <div
                  key={item.label}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    item.action && "cursor-pointer active:bg-gray-50 transition-colors"
                  )}
                  onClick={item.action}
                >
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", item.iconColor || "text-gray-500 bg-gray-100")}>
                    <item.icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{item.label}</p>
                    {item.description && <p className="text-xs text-gray-400 truncate">{item.description}</p>}
                  </div>
                  {item.badge && (
                    <span className="px-2 py-0.5 text-[10px] bg-green-50 text-green-600 rounded-full font-semibold mr-1">{item.badge}</span>
                  )}
                  {item.toggle ? (
                    <Switch
                      checked={item.value}
                      onCheckedChange={item.onToggle}
                      onClick={e => e.stopPropagation()}
                      className="data-[state=checked]:bg-green-500"
                    />
                  ) : item.action ? (
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  ) : null}
                </div>
              ))}
            </div>
          </motion.div>
        ))}

        {/* Logout Button */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="w-full h-14 rounded-2xl bg-red-50 text-red-500 font-bold text-sm flex items-center justify-center gap-2 border border-red-100 active:bg-red-100 transition-colors"
            >
              <LogOut className="h-5 w-5" /> Logout
            </motion.button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to logout?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleLogout} className="rounded-xl bg-red-500 hover:bg-red-600">Logout</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <p className="text-xs text-gray-400 text-center pb-4">INKOTA SUB v1.0.0</p>
      </main>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Enter your new password (min 6 characters).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" className="h-12 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm Password</Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="h-12 rounded-xl" />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={handleChangePassword} className="w-full rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white">Update Password</Button>
            <Button variant="outline" onClick={() => setChangePasswordOpen(false)} className="w-full rounded-xl">Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change PIN Dialog */}
      <Dialog open={changePinOpen} onOpenChange={open => { if (!open) resetPinDialog(); }}>
        <DialogContent className="rounded-2xl">
          {pinChangeStep === "confirm" && (
            <>
              <DialogHeader>
                <div className="mx-auto w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-2">
                  <Mail className="h-7 w-7 text-green-500" />
                </div>
                <DialogTitle className="text-center">Verify Your Identity</DialogTitle>
                <DialogDescription className="text-center">We'll send a code to <span className="font-medium text-gray-900">{user?.email}</span></DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button onClick={handleSendPinChangeOtp} disabled={otpLoading} className="w-full rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white">
                  {otpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Verification Code"}
                </Button>
                <Button variant="outline" onClick={resetPinDialog} className="w-full rounded-xl">Cancel</Button>
              </DialogFooter>
            </>
          )}
          {pinChangeStep === "otp" && (
            <>
              <DialogHeader>
                <div className="mx-auto w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-2">
                  <Shield className="h-7 w-7 text-green-500" />
                </div>
                <DialogTitle className="text-center">Enter Verification Code</DialogTitle>
                <DialogDescription className="text-center">Sent to {maskedEmail}. Expires in 5 minutes.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Input type="text" inputMode="numeric" maxLength={6} value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))} placeholder="Enter 6-digit code" className="h-12 rounded-xl text-center text-lg tracking-widest font-mono" autoFocus />
                <div className="text-center">
                  <button disabled={otpResendCooldown > 0 || otpLoading} onClick={handleSendPinChangeOtp} className="text-xs text-green-600 font-medium disabled:text-gray-400">
                    {otpResendCooldown > 0 ? `Resend in ${otpResendCooldown}s` : "Resend OTP"}
                  </button>
                </div>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button onClick={handleVerifyPinOtp} disabled={otpLoading || otpCode.length !== 6} className="w-full rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white">
                  {otpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify Code"}
                </Button>
                <Button variant="outline" onClick={resetPinDialog} className="w-full rounded-xl">Cancel</Button>
              </DialogFooter>
            </>
          )}
          {pinChangeStep === "newpin" && (
            <>
              <DialogHeader>
                <div className="mx-auto w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-2">
                  <Lock className="h-7 w-7 text-green-500" />
                </div>
                <DialogTitle className="text-center">{profile?.has_transaction_pin ? "Set New PIN" : "Create Transaction PIN"}</DialogTitle>
                <DialogDescription className="text-center">Enter a 4-digit PIN to secure your transactions.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <Label>New PIN</Label>
                  <Input type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))} placeholder="Enter 4-digit PIN" className="h-12 rounded-xl text-center text-lg tracking-widest" />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm PIN</Label>
                  <Input type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ""))} placeholder="Confirm 4-digit PIN" className="h-12 rounded-xl text-center text-lg tracking-widest" />
                </div>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button onClick={handleChangePin} disabled={newPin.length !== 4 || confirmPin.length !== 4} className="w-full rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white">
                  {profile?.has_transaction_pin ? "Update PIN" : "Set PIN"}
                </Button>
                <Button variant="outline" onClick={resetPinDialog} className="w-full rounded-xl">Cancel</Button>
              </DialogFooter>
            </>
          )}
          {pinChangeStep === "success" && (
            <DialogHeader>
              <div className="mx-auto w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-2">
                <Shield className="h-7 w-7 text-green-500" />
              </div>
              <DialogTitle className="text-center">PIN Updated!</DialogTitle>
              <DialogDescription className="text-center">Your transaction PIN has been changed successfully.</DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>

      {/* Biometric Setup Dialog */}
      <Dialog open={biometricSetupOpen} onOpenChange={setBiometricSetupOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5 text-green-500" /> Enable Fingerprint Login</DialogTitle>
            <DialogDescription>Enter your credentials to link fingerprint to this device.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={biometricEmail} onChange={e => setBiometricEmail(e.target.value)} placeholder="Your login email" className="h-12 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={biometricPassword} onChange={e => setBiometricPassword(e.target.value)} placeholder="Your login password" className="h-12 rounded-xl" />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white"
              onClick={async () => {
                if (!biometricEmail || !biometricPassword) { toast.error("Please enter your credentials"); return; }
                const result = await enableBiometricLogin(biometricEmail, biometricPassword);
                if (result.success) { toast.success("Fingerprint login enabled!"); setBiometricSetupOpen(false); setBiometricEmail(""); setBiometricPassword(""); }
                else toast.error(result.error || "Failed to enable");
              }}
            >
              Enable Fingerprint
            </Button>
            <Button variant="outline" onClick={() => setBiometricSetupOpen(false)} className="w-full rounded-xl">Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default Settings;
