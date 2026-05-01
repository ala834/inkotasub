import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppLogo from "@/components/common/AppLogo";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fade = setTimeout(() => setVisible(false), 1800);
    const done = setTimeout(() => onComplete(), 2400);
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-green-600 via-emerald-500 to-teal-600"
        >
          {/* Glow */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.2 }}
            transition={{ duration: 1.2 }}
            className="absolute w-72 h-72 rounded-full bg-white/10 blur-3xl"
          />

          {/* Logo */}
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative z-10"
          >
            <AppLogo className="w-28 h-28" />
          </motion.div>

          {/* App name */}
          <motion.h1
            className="text-3xl font-bold text-white mt-4 relative z-10 tracking-wide"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            Inkota<span className="text-amber-400">sub</span>
          </motion.h1>

          {/* Tagline */}
          <motion.p
            className="text-white/60 text-sm mt-2 relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }}
          >
            Smart VTU & Bill Payments
          </motion.p>

          {/* Loading dots */}
          <div className="flex gap-1.5 mt-8 relative z-10">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-white/50"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
