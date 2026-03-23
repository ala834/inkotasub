import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Smartphone, Shield, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLogo from "@/components/common/AppLogo";

const features = [
  {
    icon: Smartphone,
    title: "Instant Top-ups",
    description: "Buy airtime & data in seconds",
  },
  {
    icon: Zap,
    title: "Bill Payments",
    description: "Pay electricity, TV & more",
  },
  {
    icon: Shield,
    title: "Secure Wallet",
    description: "Your money is always safe",
  },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen gradient-hero overflow-hidden">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-2">
          <AppLogo className="w-10 h-10" />
          <span className="font-display font-bold text-xl text-foreground">
            INKOTA<span className="text-primary">SUB</span>
          </span>
        </div>
      </header>

      <main className="container mx-auto px-4 pt-8 pb-20">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4 leading-tight">
            Smart VTU &<br />
            <span className="text-gradient">Bill Payments</span>
            <br />Made Easy
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto mb-8">
            Buy airtime, data bundles, pay bills, and more — all from your phone. Fast, secure, and reliable.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => navigate("/dashboard")}
              size="lg"
              className="gradient-primary text-primary-foreground h-14 px-8 rounded-2xl text-lg font-semibold shadow-glow hover:shadow-glow-lg transition-shadow"
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-14 px-8 rounded-2xl text-lg font-semibold border-2"
            >
              Learn More
            </Button>
          </div>
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-16"
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + index * 0.1 }}
              className="glass-card rounded-2xl p-6 text-center"
            >
              <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
                <feature.icon className="h-7 w-7 text-primary-foreground" />
              </div>
              <h3 className="font-display font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-3 gap-4 max-w-md mx-auto"
        >
          {[
            { value: "50K+", label: "Users" },
            { value: "₦2B+", label: "Transactions" },
            { value: "99.9%", label: "Uptime" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl md:text-3xl font-display font-bold text-primary">
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </main>

      {/* Floating decoration */}
      <div className="fixed -bottom-32 -right-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="fixed -top-32 -left-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
    </div>
  );
};

export default Index;
