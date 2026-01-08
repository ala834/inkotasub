import { Home, Wallet, History, Settings, LayoutGrid } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

const navItems = [
  { icon: Home, label: "Home", id: "home" },
  { icon: LayoutGrid, label: "Services", id: "services" },
  { icon: Wallet, label: "Wallet", id: "wallet" },
  { icon: History, label: "History", id: "history" },
  { icon: Settings, label: "Settings", id: "settings" },
];

interface BottomNavProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const BottomNav = ({ activeTab = "home", onTabChange }: BottomNavProps) => {
  const [active, setActive] = useState(activeTab);

  const handleTabChange = (id: string) => {
    setActive(id);
    onTabChange?.(id);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-card border-t border-border/50 px-2 pb-safe">
      <div className="container mx-auto max-w-lg">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className="relative flex flex-col items-center gap-1 px-3 py-2 min-w-[64px]"
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-primary/10 rounded-2xl"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <item.icon
                  className={`h-5 w-5 transition-colors relative z-10 ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <span
                  className={`text-xs font-medium transition-colors relative z-10 ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
