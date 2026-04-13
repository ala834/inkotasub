import { Home, Wallet, History, Settings, LayoutGrid } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-2px_16px_rgba(0,0,0,0.04)] px-2 pb-safe">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-around py-1.5">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className="relative flex flex-col items-center gap-0.5 px-3 py-2 min-w-[56px] active:scale-95 transition-transform"
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-1 bg-green-500 rounded-full"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <item.icon
                  className={cn(
                    "h-5 w-5 transition-colors",
                    isActive ? "text-green-600" : "text-gray-400"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors",
                    isActive ? "text-green-600" : "text-gray-400"
                  )}
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
