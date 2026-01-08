import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface ServiceCardProps {
  icon: LucideIcon;
  label: string;
  color: string;
  onClick?: () => void;
  delay?: number;
}

const ServiceCard = ({ icon: Icon, label, color, onClick, delay = 0 }: ServiceCardProps) => {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 300 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4"
    >
      <div
        className="service-icon shadow-lg"
        style={{ background: color }}
      >
        <Icon className="h-6 w-6" />
      </div>
      <span className="text-xs font-medium text-foreground text-center leading-tight">
        {label}
      </span>
    </motion.button>
  );
};

export default ServiceCard;
