import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Smartphone, Shield, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const slides = [
  {
    icon: Smartphone,
    title: "Buy Airtime & Data Instantly",
    description: "Recharge airtime and data in seconds across all networks",
    gradient: "from-green-500 to-emerald-600",
    bg: "from-green-50 to-emerald-50",
  },
  {
    icon: Shield,
    title: "Fast & Secure Payments",
    description: "Enjoy smooth and secure transactions anytime",
    gradient: "from-emerald-500 to-teal-600",
    bg: "from-emerald-50 to-teal-50",
  },
  {
    icon: Users,
    title: "Earn with Referrals",
    description: "Invite friends and earn rewards easily",
    gradient: "from-teal-500 to-green-600",
    bg: "from-teal-50 to-green-50",
  },
];

const Onboarding = () => {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const navigate = useNavigate();

  const finish = useCallback(() => {
    localStorage.setItem("inkota_onboarded", "true");
    navigate("/auth", { replace: true });
  }, [navigate]);

  const next = () => {
    if (current === slides.length - 1) {
      finish();
    } else {
      setDirection(1);
      setCurrent((p) => p + 1);
    }
  };

  const isLast = current === slides.length - 1;
  const slide = slides[current];

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-green-50 flex flex-col">
      {/* Skip */}
      <div className="flex justify-end px-5 pt-5">
        {!isLast && (
          <button
            onClick={finish}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>
        )}
      </div>

      {/* Slide content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex flex-col items-center text-center w-full max-w-sm"
          >
            {/* Icon circle */}
            <div className={`w-32 h-32 rounded-full bg-gradient-to-br ${slide.gradient} flex items-center justify-center mb-10 shadow-lg`}>
              <slide.icon className="w-14 h-14 text-white" strokeWidth={1.5} />
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-3 leading-tight">
              {slide.title}
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              {slide.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom section */}
      <div className="px-6 pb-10 flex flex-col items-center gap-6">
        {/* Dots */}
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current
                  ? "w-8 bg-gradient-to-r from-green-500 to-emerald-500"
                  : "w-2 bg-gray-300"
              }`}
            />
          ))}
        </div>

        {/* Button */}
        <Button
          onClick={next}
          className="w-full max-w-sm h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 text-white shadow-lg"
        >
          {isLast ? "Get Started" : "Next"}
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default Onboarding;
