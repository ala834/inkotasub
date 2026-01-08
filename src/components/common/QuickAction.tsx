import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface QuickActionProps {
  icon: LucideIcon;
  label: string;
  sublabel?: string;
  onClick?: () => void;
  variant?: "default" | "highlight";
}

const QuickAction = ({ 
  icon: Icon, 
  label, 
  sublabel, 
  onClick, 
  variant = "default" 
}: QuickActionProps) => {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`flex items-center gap-3 p-4 rounded-2xl w-full transition-colors ${
        variant === "highlight"
          ? "bg-primary/10 hover:bg-primary/15"
          : "bg-muted hover:bg-muted/80"
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        variant === "highlight" ? "bg-primary" : "bg-card"
      }`}>
        <Icon className={`h-5 w-5 ${
          variant === "highlight" ? "text-primary-foreground" : "text-primary"
        }`} />
      </div>
      <div className="text-left">
        <p className="font-medium text-foreground">{label}</p>
        {sublabel && (
          <p className="text-sm text-muted-foreground">{sublabel}</p>
        )}
      </div>
    </motion.button>
  );
};

export default QuickAction;
