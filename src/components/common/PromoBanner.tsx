import { motion } from "framer-motion";
import { Gift, ChevronRight } from "lucide-react";

const PromoBanner = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="relative overflow-hidden rounded-2xl p-5 cursor-pointer group"
      style={{
        background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
      }}
    >
      {/* Background decoration */}
      <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/10" />
      <div className="absolute -right-2 -bottom-2 w-20 h-20 rounded-full bg-white/10" />

      <div className="relative z-10 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
          <Gift className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1">
          <h4 className="font-display font-semibold text-white text-lg">
            Refer & Earn ₦500
          </h4>
          <p className="text-white/80 text-sm">
            Invite friends and earn rewards
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-white/80 group-hover:translate-x-1 transition-transform" />
      </div>
    </motion.div>
  );
};

export default PromoBanner;
