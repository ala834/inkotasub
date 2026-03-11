import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface ServiceCardProps {
  icon: LucideIcon;
  label: string;
  gradient?: string;
  shadow?: string;
  color?: string;
  onClick?: () => void;
  delay?: number;
  disabled?: boolean;
}

const ServiceCard = ({ icon: Icon, label, gradient, shadow, color, onClick, delay = 0, disabled = false }: ServiceCardProps) => {
  const gradientStyle = gradient 
    ? { background: `linear-gradient(135deg, var(--tw-gradient-stops))` }
    : color ? { background: color } : {};

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 300 }}
      whileHover={disabled ? {} : { scale: 1.05 }}
      whileTap={disabled ? {} : { scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}
    >
      <div
        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${gradient || ''} ${shadow || ''}`}
        style={color && !gradient ? { background: color } : undefined}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-medium text-foreground text-center leading-tight">
        {label}
      </span>
    </motion.button>
  );
};

export default ServiceCard;