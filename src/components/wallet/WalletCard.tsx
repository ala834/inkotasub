import { Eye, EyeOff, Plus, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface WalletCardProps {
  balance?: number;
  onFundWallet?: () => void;
  onTransfer?: () => void;
}

const WalletCard = ({ balance = 0, onFundWallet, onTransfer }: WalletCardProps) => {
  const [showBalance, setShowBalance] = useState(true);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="relative overflow-hidden rounded-3xl gradient-primary p-6 text-primary-foreground glow"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full border-2 border-white/30" />
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border-2 border-white/20" />
        <div className="absolute -left-8 -bottom-8 w-40 h-40 rounded-full border-2 border-white/20" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm opacity-80 font-medium">Wallet Balance</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-3xl font-bold font-display">
                ₦{showBalance ? formatCurrency(balance) : "••••••"}
              </span>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                {showBalance ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            onClick={onFundWallet}
            className="flex-1 bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl h-11"
          >
            <Plus className="h-4 w-4 mr-2" />
            Fund Wallet
          </Button>
          <Button
            onClick={onTransfer}
            variant="outline"
            className="flex-1 bg-transparent hover:bg-white/10 text-white border-white/30 rounded-xl h-11"
          >
            <ArrowUpRight className="h-4 w-4 mr-2" />
            Transfer
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

export default WalletCard;
