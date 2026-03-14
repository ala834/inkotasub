import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import WalletCard from "@/components/wallet/WalletCard";
import ServicesGrid from "@/components/services/ServicesGrid";
import PinSetupDialog from "@/components/common/PinSetupDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";

const Dashboard = () => {
  const navigate = useNavigate();
  const { profile, user, refreshProfile } = useAuth();
  const { wallet } = useWallet();
  const [showPinSetup, setShowPinSetup] = useState(false);

  // Prompt PIN setup if user has no transaction PIN
  useEffect(() => {
    if (profile && !profile.transaction_pin) {
      setShowPinSetup(true);
    }
  }, [profile]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const getFirstName = () => {
    if (profile?.full_name) {
      return profile.full_name.split(" ")[0];
    }
    if (user?.email) {
      return user.email.split("@")[0];
    }
    return "User";
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header />

      <main className="container mx-auto px-4 py-6 max-w-lg">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <p className="text-muted-foreground text-sm">{getGreeting()},</p>
          <h1 className="text-2xl font-display font-bold text-foreground">
            {getFirstName()}
          </h1>
        </motion.div>

        {/* Wallet Card */}
        <div className="mb-8">
          <WalletCard
            balance={wallet?.balance || 0}
            onFundWallet={() => navigate("/fund-wallet")}
            onTransfer={() => navigate("/transfer")}
          />
        </div>

        {/* Quick Services */}
        <ServicesGrid />
      </main>

      <BottomNav />

      {/* PIN Setup Prompt for new users */}
      <PinSetupDialog
        open={showPinSetup}
        onOpenChange={setShowPinSetup}
        onSuccess={() => {
          refreshProfile?.();
        }}
      />
    </div>
  );
};

export default Dashboard;