import { 
  Smartphone, 
  Wifi, 
  Zap, 
  Tv, 
  CreditCard,
  Gift,
  Headphones,
  GraduationCap,
  Banknote,
  ArrowRightLeft
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import ServiceCard from "./ServiceCard";
import { useEnabledServices } from "@/hooks/useEnabledServices";
import { Skeleton } from "@/components/ui/skeleton";

const allServices = [
  { 
    icon: Smartphone, 
    label: "Airtime", 
    gradient: "from-emerald-500 to-teal-600",
    shadow: "shadow-emerald-500/25",
    path: "/airtime",
    serviceKey: "airtime" as const
  },
  { 
    icon: Wifi, 
    label: "Data Bundle", 
    gradient: "from-blue-500 to-indigo-600",
    shadow: "shadow-blue-500/25",
    path: "/data",
    serviceKey: "data" as const
  },
  { 
    icon: Zap, 
    label: "Electricity", 
    gradient: "from-amber-500 to-orange-600",
    shadow: "shadow-amber-500/25",
    path: "/electricity",
    serviceKey: "electricity" as const
  },
  { 
    icon: Tv, 
    label: "Cable TV", 
    gradient: "from-violet-500 to-purple-600",
    shadow: "shadow-violet-500/25",
    path: "/cable-tv",
    serviceKey: "cable" as const
  },
  { 
    icon: GraduationCap, 
    label: "Exam Cards", 
    gradient: "from-pink-500 to-rose-600",
    shadow: "shadow-pink-500/25",
    path: "/exam-cards",
    serviceKey: "exam_pin" as const
  },
  { 
    icon: Banknote, 
    label: "Airtime to Cash", 
    gradient: "from-cyan-500 to-blue-600",
    shadow: "shadow-cyan-500/25",
    path: "#",
    serviceKey: null
  },
  { 
    icon: ArrowRightLeft, 
    label: "Transfer", 
    gradient: "from-teal-500 to-emerald-600",
    shadow: "shadow-teal-500/25",
    path: "/transfer",
    serviceKey: null
  },
  { 
    icon: Gift, 
    label: "Referrals", 
    gradient: "from-rose-500 to-pink-600",
    shadow: "shadow-rose-500/25",
    path: "/referrals",
    serviceKey: null
  },
  { 
    icon: Headphones, 
    label: "Support", 
    gradient: "from-sky-500 to-cyan-600",
    shadow: "shadow-sky-500/25",
    path: "/support",
    serviceKey: null
  },
];

const ServicesGrid = () => {
  const navigate = useNavigate();
  const { enabledServices, isLoading } = useEnabledServices();

  // Filter services based on admin settings
  const services = allServices.filter((service) => {
    if (!service.serviceKey) return true;
    return enabledServices[service.serviceKey];
  });

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div key={i} className="flex flex-col items-center gap-3 p-4">
              <Skeleton className="w-14 h-14 rounded-2xl" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Quick Services</h2>
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        {services.map((service, index) => (
          <ServiceCard
            key={service.label}
            icon={service.icon}
            label={service.label}
            gradient={service.gradient}
            shadow={service.shadow}
            delay={0.05 + index * 0.03}
            onClick={() => service.path !== "#" && navigate(service.path)}
            disabled={service.path === "#"}
          />
        ))}
      </div>
    </motion.div>
  );
};

export default ServicesGrid;