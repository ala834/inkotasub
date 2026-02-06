import { 
  Smartphone, 
  Wifi, 
  Zap, 
  Tv, 
  CreditCard,
  Gift,
  Headphones,
  GraduationCap
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
    color: "linear-gradient(135deg, #10B981 0%, #059669 100%)", 
    path: "/airtime",
    serviceKey: "airtime" as const
  },
  { 
    icon: Wifi, 
    label: "Data Bundle", 
    color: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)", 
    path: "/data",
    serviceKey: "data" as const
  },
  { 
    icon: Zap, 
    label: "Electricity", 
    color: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)", 
    path: "/electricity",
    serviceKey: "electricity" as const
  },
  { 
    icon: Tv, 
    label: "Cable TV", 
    color: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)", 
    path: "/cable-tv",
    serviceKey: "cable" as const
  },
  { 
    icon: GraduationCap, 
    label: "Exam Cards", 
    color: "linear-gradient(135deg, #EC4899 0%, #DB2777 100%)", 
    path: "/exam-cards",
    serviceKey: "exam_pin" as const
  },
  { 
    icon: CreditCard, 
    label: "Transfer", 
    color: "linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)", 
    path: "/transfer",
    serviceKey: null // Always enabled
  },
  { 
    icon: Gift, 
    label: "Referrals", 
    color: "linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)", 
    path: "/referrals",
    serviceKey: null // Always enabled
  },
  { 
    icon: Headphones, 
    label: "Support", 
    color: "linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)", 
    path: "/support",
    serviceKey: null // Always enabled
  },
];

const ServicesGrid = () => {
  const navigate = useNavigate();
  const { enabledServices, isLoading } = useEnabledServices();

  // Filter services based on admin settings
  const services = allServices.filter((service) => {
    // Always show services without a serviceKey (Transfer, Referrals, Support)
    if (!service.serviceKey) return true;
    // Check if the service is enabled
    return enabledServices[service.serviceKey];
  });

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card rounded-3xl p-4 shadow-sm border border-border/50"
      >
        <Skeleton className="h-6 w-32 mb-4 mx-2" />
        <div className="grid grid-cols-4 gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex flex-col items-center p-3">
              <Skeleton className="w-12 h-12 rounded-2xl mb-2" />
              <Skeleton className="h-3 w-14" />
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
      transition={{ delay: 0.2 }}
      className="bg-card rounded-3xl p-4 shadow-sm border border-border/50"
    >
      <h3 className="font-display font-semibold text-foreground mb-4 px-2">
        Quick Services
      </h3>
      <div className="grid grid-cols-4 gap-1">
        {services.map((service, index) => (
          <ServiceCard
            key={service.label}
            icon={service.icon}
            label={service.label}
            color={service.color}
            delay={0.1 + index * 0.05}
            onClick={() => service.path !== "#" && navigate(service.path)}
          />
        ))}
      </div>
    </motion.div>
  );
};

export default ServicesGrid;
