import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface ServiceCardProps {
  icon: LucideIcon;
  label: string;
  color?: string;
  onClick?: () => void;
  delay?: number;
  disabled?: boolean;
}

const ServiceCard = ({ 
  icon: Icon, 
  label, 
  color,
  onClick, 
  delay = 0, 
  disabled = false 
}: ServiceCardProps) => {
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={disabled ? {} : { scale: 1.06, y: -4 }}
      whileTap={disabled ? {} : { scale: 0.94 }}
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center gap-2.5 p-4 rounded-3xl transition-all duration-300 group ${
        disabled 
          ? 'opacity-40 cursor-not-allowed' 
          : 'cursor-pointer'
      }`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Glassmorphism card background */}
      <div className="absolute inset-0 rounded-3xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-md group-hover:shadow-lg group-hover:border-primary/20 transition-all duration-300" />
      
      {/* Glow effect on hover */}
      <div 
        className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ 
          boxShadow: color ? `0 8px 32px ${color}20, 0 0 0 1px ${color}15` : undefined 
        }} 
      />

      {/* Icon container */}
      <div className="relative z-10">
        <div
          className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center shadow-lg transition-shadow duration-300 group-hover:shadow-xl"
          style={{ 
            background: color ? `linear-gradient(135deg, ${color}, ${color}CC)` : undefined,
            boxShadow: color ? `0 6px 20px ${color}40` : undefined
          }}
        >
          <Icon className="h-6 w-6 text-white drop-shadow-sm" strokeWidth={2.5} />
        </div>
      </div>

      {/* Label */}
      <span className="relative z-10 text-[11px] font-semibold text-foreground text-center leading-tight max-w-[72px] tracking-tight">
        {label}
      </span>
    </motion.button>
  );
};

export default ServiceCard;
