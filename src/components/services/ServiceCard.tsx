import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
  disabled = false,
}: ServiceCardProps) => {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 300, damping: 24 }}
      whileTap={disabled ? {} : { scale: 0.92 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-2 py-3 px-1 rounded-2xl transition-all",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:bg-gray-50"
      )}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-md"
        style={{
          background: color ? `linear-gradient(135deg, ${color}, ${color}CC)` : "#e5e7eb",
          boxShadow: color ? `0 4px 14px ${color}30` : undefined,
        }}
      >
        <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
      </div>
      <span className="text-[11px] font-medium text-gray-600 text-center leading-tight max-w-[68px]">
        {label}
      </span>
    </motion.button>
  );
};

export default ServiceCard;
