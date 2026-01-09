import { 
  Smartphone, 
  Wifi, 
  Zap, 
  Tv, 
  GraduationCap, 
  CreditCard,
  Gift,
  MoreHorizontal
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import ServiceCard from "./ServiceCard";

const services = [
  { icon: Smartphone, label: "Airtime", color: "linear-gradient(135deg, #10B981 0%, #059669 100%)", path: "/airtime" },
  { icon: Wifi, label: "Data Bundle", color: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)", path: "/data" },
  { icon: Zap, label: "Electricity", color: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)", path: "/electricity" },
  { icon: Tv, label: "Cable TV", color: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)", path: "/cable-tv" },
  { icon: CreditCard, label: "Transfer", color: "linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)", path: "/transfer" },
  { icon: Gift, label: "Referrals", color: "linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)", path: "/referrals" },
  { icon: GraduationCap, label: "Exam Cards", color: "linear-gradient(135deg, #EC4899 0%, #BE185D 100%)", path: "#" },
  { icon: MoreHorizontal, label: "More", color: "linear-gradient(135deg, #6B7280 0%, #4B5563 100%)", path: "#" },
];

const ServicesGrid = () => {
  const navigate = useNavigate();

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
