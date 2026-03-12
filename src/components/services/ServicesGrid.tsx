import { 
  Smartphone, 
  Wifi, 
  Zap, 
  Tv, 
  Gift,
  Headphones,
  GraduationCap,
  ArrowLeftRight,
  Send,
  Globe,
  Calculator,
  MessageCircle,
  Layers,
  Radio
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import ServiceCard from "./ServiceCard";
import { useEnabledServices } from "@/hooks/useEnabledServices";
import { Skeleton } from "@/components/ui/skeleton";

const mainServices = [
  { icon: Smartphone, label: "Airtime", color: "#10B981", path: "/airtime", serviceKey: "airtime" as const },
  { icon: Wifi, label: "Data Bundle", color: "#3B82F6", path: "/data", serviceKey: "data" as const },
  { icon: Zap, label: "Electricity", color: "#F97316", path: "/electricity", serviceKey: "electricity" as const },
  { icon: Tv, label: "Cable TV", color: "#8B5CF6", path: "/cable-tv", serviceKey: "cable" as const },
  { icon: GraduationCap, label: "Exam Cards", color: "#EC4899", path: "/exam-cards", serviceKey: "exam_pin" as const },
  { icon: Send, label: "Transfer", color: "#2563EB", path: "/transfer", serviceKey: null },
];

const moreServices = [
  { icon: Layers, label: "Bulk Airtime", color: "#059669", path: "/bulk-airtime", serviceKey: null },
  { icon: Radio, label: "Bulk Data", color: "#2563EB", path: "/bulk-data", serviceKey: null },
  { icon: Globe, label: "Internet", color: "#7C3AED", path: "/internet-services", serviceKey: null },
  { icon: ArrowLeftRight, label: "Airtime to Cash", color: "#14B8A6", path: "#", serviceKey: null },
  { icon: Calculator, label: "Calculator", color: "#D97706", path: "/calculator", serviceKey: null },
  { icon: Gift, label: "Referrals", color: "#EF4444", path: "/referrals", serviceKey: null },
  { icon: MessageCircle, label: "Live Chat", color: "#0EA5E9", path: "/support", serviceKey: null },
  { icon: Headphones, label: "Support", color: "#06B6D4", path: "/support", serviceKey: null },
];

const ServicesGrid = () => {
  const navigate = useNavigate();
  const { enabledServices, isLoading } = useEnabledServices();

  const filteredMain = mainServices.filter((s) => !s.serviceKey || enabledServices[s.serviceKey]);
  const filteredMore = moreServices.filter((s) => !s.serviceKey || enabledServices[s.serviceKey]);

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex flex-col items-center gap-3 p-4">
              <Skeleton className="w-[52px] h-[52px] rounded-2xl" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Services */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Quick Services</h2>
        <div className="grid grid-cols-3 gap-2">
          {filteredMain.map((service, index) => (
            <ServiceCard
              key={service.label}
              icon={service.icon}
              label={service.label}
              color={service.color}
              delay={0.04 + index * 0.03}
              onClick={() => service.path !== "#" && navigate(service.path)}
              disabled={service.path === "#"}
            />
          ))}
        </div>
      </motion.div>

      {/* More Services */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">More Services</h2>
        <div className="grid grid-cols-4 gap-2">
          {filteredMore.map((service, index) => (
            <ServiceCard
              key={service.label}
              icon={service.icon}
              label={service.label}
              color={service.color}
              delay={0.1 + index * 0.03}
              onClick={() => service.path !== "#" && navigate(service.path)}
              disabled={service.path === "#"}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default ServicesGrid;
