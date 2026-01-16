import { Home, Wallet, History, Settings, LayoutGrid } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { icon: Home, label: "Home", id: "home", path: "/dashboard" },
  { icon: LayoutGrid, label: "Services", id: "services", path: "/airtime" },
  { icon: Wallet, label: "Wallet", id: "wallet", path: "/fund-wallet" },
  { icon: History, label: "History", id: "history", path: "/history" },
  { icon: Settings, label: "Settings", id: "settings", path: "/settings" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveTab = () => {
    const path = location.pathname;
    if (path === "/dashboard") return "home";
    if (["/airtime", "/data", "/electricity", "/cable-tv"].includes(path)) return "services";
    if (path === "/fund-wallet") return "wallet";
    if (path === "/history") return "history";
    if (path === "/settings" || path === "/profile") return "settings";
    return "home";
  };

  const activeTab = getActiveTab();

  const handleTabChange = (path: string) => {
    navigate(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-card border-t border-border/50 px-2 pb-safe">
      <div className="container mx-auto max-w-lg">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.path)}
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
