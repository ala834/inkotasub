import { useState } from "react";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import WalletCard from "@/components/wallet/WalletCard";
import ServicesGrid from "@/components/services/ServicesGrid";
import TransactionsList from "@/components/transactions/TransactionsList";
import PromoBanner from "@/components/common/PromoBanner";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("home");

  // Mock user data - will be replaced with real data from Supabase
  const mockBalance = 45750.5;
  const userName = "Chinedu";

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
          <p className="text-muted-foreground">Good afternoon,</p>
          <h1 className="text-2xl font-display font-bold text-foreground">
            {userName} 👋
          </h1>
        </motion.div>

        {/* Wallet Card */}
        <div className="mb-6">
          <WalletCard
            balance={mockBalance}
            onFundWallet={() => console.log("Fund wallet")}
            onTransfer={() => console.log("Transfer")}
          />
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

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Dashboard;
