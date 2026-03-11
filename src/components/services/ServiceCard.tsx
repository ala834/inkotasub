import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface ServiceCardProps {
  icon: LucideIcon;
  label: string;
  gradient?: string;
  shadow?: string;
  color?: string;
  iconColor?: string;
  onClick?: () => void;
  delay?: number;
  disabled?: boolean;
}

const ServiceCard = ({ 
  icon: Icon, 
  label, 
  gradient, 
  shadow, 
  color, 
  iconColor = "text-white",
  onClick, 
  delay = 0, 
  disabled = false 
}: ServiceCardProps) => {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 300, damping: 20 }}
      whileHover={disabled ? {} : { scale: 1.05, y: -2 }}
      whileTap={disabled ? {} : { scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-200 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/30'}`}
    >
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center ${gradient || ''} ${shadow || 'shadow-lg'} transition-shadow duration-200 hover:shadow-xl`}
        style={color ? { background: color } : undefined}
      >
        <Icon className={`h-6 w-6 ${iconColor} drop-shadow-sm`} strokeWidth={2.5} />
      </div>
      <span className="text-xs font-semibold text-foreground text-center leading-tight max-w-[72px]">
        {label}
      </span>
    </motion.button>
  );
};

export default ServiceCard;