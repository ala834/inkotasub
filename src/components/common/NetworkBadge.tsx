import { motion } from "framer-motion";

interface NetworkBadgeProps {
  network: "mtn" | "airtel" | "glo" | "9mobile";
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  onClick?: () => void;
}

const networkColors = {
  mtn: { bg: "#FFCC00", text: "#000000", name: "MTN" },
  airtel: { bg: "#E40000", text: "#FFFFFF", name: "Airtel" },
  glo: { bg: "#00A651", text: "#FFFFFF", name: "Glo" },
  "9mobile": { bg: "#006B53", text: "#FFFFFF", name: "9mobile" },
};

const sizeClasses = {
  sm: "w-10 h-10 text-xs",
  md: "w-14 h-14 text-sm",
  lg: "w-16 h-16 text-base",
};

const NetworkBadge = ({ network, size = "md", selected, onClick }: NetworkBadgeProps) => {
  const colors = networkColors[network];
  const sizeClass = sizeClasses[size];

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`${sizeClass} rounded-2xl font-bold flex items-center justify-center transition-all ${
        selected ? "ring-2 ring-primary ring-offset-2" : ""
      }`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
      }}
    >
      {colors.name}
    </motion.button>
  );
};

export default NetworkBadge;
