import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import WalletCard from "@/components/wallet/WalletCard";
import ServicesGrid from "@/components/services/ServicesGrid";
import SMEPlugServicesStatus from "@/components/services/SMEPlugServicesStatus";
import TransactionsList from "@/components/transactions/TransactionsList";
import PromoBanner from "@/components/common/PromoBanner";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";

const Dashboard = () => {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { wallet } = useWallet();

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
    <div className="min-h-screen gradient-hero pb-24">
      <Header />

      <main className="container mx-auto px-4 py-6 max-w-lg">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <p className="text-muted-foreground">{getGreeting()},</p>
          <h1 className="text-2xl font-display font-bold text-foreground">
            {getFirstName()} 👋
          </h1>
        </motion.div>

        {/* Wallet Card */}
        <div className="mb-6">
          <WalletCard
            balance={wallet?.balance || 0}
            onFundWallet={() => navigate("/fund-wallet")}
            onTransfer={() => navigate("/transfer")}
          />
        </div>

        {/* Provider Services Status */}
        <div className="mb-4">
          <SMEPlugServicesStatus />
        </div>

        {/* Promo Banner */}
        <div className="mb-6">
          <PromoBanner />
        </div>

        {/* Services Grid */}
        <div className="mb-6">
          <ServicesGrid />
        </div>

        {/* Recent Transactions */}
        <div className="mb-6">
          <TransactionsList />
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Dashboard;
