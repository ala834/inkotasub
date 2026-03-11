import { 
  Smartphone, 
  Wifi, 
  Zap, 
  Tv, 
  Gift,
  Headphones,
  GraduationCap,
  ArrowLeftRight,
  Send
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
    color: "#10B981",
    shadow: "shadow-emerald-500/30",
    path: "/airtime",
    serviceKey: "airtime" as const
  },
  { 
    icon: Wifi, 
    label: "Data Bundle", 
    color: "#3B82F6",
    shadow: "shadow-blue-500/30",
    path: "/data",
    serviceKey: "data" as const
  },
  { 
    icon: Zap, 
    label: "Electricity", 
    color: "#F97316",
    shadow: "shadow-orange-500/30",
    path: "/electricity",
    serviceKey: "electricity" as const
  },
  { 
    icon: Tv, 
    label: "Cable TV", 
    color: "#8B5CF6",
    shadow: "shadow-violet-500/30",
    path: "/cable-tv",
    serviceKey: "cable" as const
  },
  { 
    icon: GraduationCap, 
    label: "Exam Cards", 
    color: "#EC4899",
    shadow: "shadow-pink-500/30",
    path: "/exam-cards",
    serviceKey: "exam_pin" as const
  },
  { 
    icon: ArrowLeftRight, 
    label: "Airtime to Cash", 
    color: "#14B8A6",
    shadow: "shadow-teal-500/30",
    path: "#",
    serviceKey: null
  },
  { 
    icon: Send, 
    label: "Transfer", 
    color: "#2563EB",
    shadow: "shadow-blue-600/30",
    path: "/transfer",
    serviceKey: null
  },
  { 
    icon: Gift, 
    label: "Referrals", 
    color: "#EF4444",
    shadow: "shadow-red-500/30",
    path: "/referrals",
    serviceKey: null
  },
  { 
    icon: Headphones, 
    label: "Support", 
    color: "#06B6D4",
    shadow: "shadow-cyan-500/30",
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