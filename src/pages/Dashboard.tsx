import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Bell, User, Eye, EyeOff, Plus, ArrowUpRight, ChevronRight, Shield, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import BottomNav from "@/components/layout/BottomNav";
import ServicesGrid from "@/components/services/ServicesGrid";
import PinSetupDialog from "@/components/common/PinSetupDialog";
import NotificationsDropdown from "@/components/notifications/NotificationsDropdown";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import PromoBanner from "@/components/common/PromoBanner";

const Dashboard = () => {
  const navigate = useNavigate();
  const { profile, user, refreshProfile } = useAuth();
  const { wallet } = useWallet();
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showBalance, setShowBalance] = useState(true);

  useEffect(() => {
    if (profile && !profile.has_transaction_pin) setShowPinSetup(true);
  }, [profile]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const getFirstName = () => {
    if (profile?.full_name) return profile.full_name.split(" ")[0];
    if (user?.email) return user.email.split("@")[0];
    return "User";
  };

  const getInitials = () => {
    if (profile?.full_name) return profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
    return user?.email?.charAt(0)?.toUpperCase() || "U";
  };

  const formatBalance = (amount: number) =>
    new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Green Header with Wallet */}
      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 px-4 pt-4 pb-16 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -left-6 top-20 w-28 h-28 rounded-full bg-white/5" />
        <div className="absolute right-10 bottom-0 w-20 h-20 rounded-full bg-white/5" />

        {/* Top bar */}
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/profile")} className="active:scale-95 transition-transform">
              <Avatar className="w-10 h-10 border-2 border-white/30">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-white/20 text-white text-sm font-bold">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </button>
            <div>
              <p className="text-white/70 text-xs font-medium">{getGreeting()}</p>
              <h1 className="text-white font-bold text-base leading-tight">{getFirstName()}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsDropdown />
          </div>
        </div>

        {/* Wallet Balance */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative z-10">
          <p className="text-white/70 text-xs font-medium mb-1">Wallet Balance</p>
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl font-bold text-white">
              ₦{showBalance ? formatBalance(wallet?.balance || 0) : "••••••"}
            </span>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center active:bg-white/25 transition-colors"
            >
              {showBalance ? <EyeOff className="h-4 w-4 text-white" /> : <Eye className="h-4 w-4 text-white" />}
            </button>
          </div>

          <div className="flex gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/fund-wallet")}
              className="flex-1 h-11 rounded-xl bg-white text-green-600 font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-green-900/20 active:bg-gray-50 transition-colors"
            >
              <Plus className="h-4 w-4" /> Fund Wallet
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/transfer")}
              className="flex-1 h-11 rounded-xl bg-white/20 text-white font-semibold text-sm flex items-center justify-center gap-2 border border-white/20 active:bg-white/30 transition-colors"
            >
              <ArrowUpRight className="h-4 w-4" /> Transfer
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* Content area with negative margin to overlap header */}
      <main className="px-4 -mt-6 max-w-lg mx-auto space-y-5 relative z-10">
        {/* Promo Banner */}
        <PromoBanner />

        {/* Services */}
        <ServicesGrid />
      </main>

      <BottomNav />

      <PinSetupDialog
        open={showPinSetup}
        onOpenChange={setShowPinSetup}
        onSuccess={() => refreshProfile?.()}
      />
    </div>
  );
};

export default Dashboard;
