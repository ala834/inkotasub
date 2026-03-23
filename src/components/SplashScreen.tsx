import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppLogo from "@/components/common/AppLogo";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [phase, setPhase] = useState<"logo" | "fade-out">("logo");

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase("fade-out"), 1800);
    const doneTimer = setTimeout(() => onComplete(), 2400);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== "fade-out" ? null : null}
      <motion.div
        key="splash"
        initial={{ opacity: 1 }}
        animate={phase === "fade-out" ? { opacity: 0 } : { opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
        style={{ background: "linear-gradient(135deg, hsl(168 76% 32%), hsl(222 47% 11%))" }}
      >
        {/* Glow ring */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.15 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="absolute w-72 h-72 rounded-full"
          style={{ background: "radial-gradient(circle, hsl(168 76% 60% / 0.4), transparent 70%)" }}
        />

        {/* Logo */}
        <motion.img
          src={inkotaLogo}
          alt="INKOTA SUB"
          className="w-28 h-28 object-contain relative z-10"
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
        />

        {/* Brand name */}
        <motion.h1
          className="text-3xl font-display font-bold text-white mt-4 relative z-10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
        >
          INKOTA<span style={{ color: "hsl(38 92% 50%)" }}>SUB</span>
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
        <motion.div
          className="flex gap-1.5 mt-8 relative z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-white/50"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SplashScreen;
