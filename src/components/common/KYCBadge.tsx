import { Shield, ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface KYCBadgeProps {
  level?: string | null;
  size?: "sm" | "md";
}

const KYCBadge = ({ level, size = "sm" }: KYCBadgeProps) => {
  if (!level) return null;

  const config: Record<string, { icon: typeof Shield; label: string; className: string }> = {
    level_1: { icon: Shield, label: "Basic Verified", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    level_2: { icon: ShieldCheck, label: "Intermediate Verified", className: "bg-primary/10 text-primary border-primary/20" },
    level_3: { icon: ShieldAlert, label: "Fully Verified", className: "bg-green-500/10 text-green-600 border-green-500/20" },
  };

  const c = config[level] || config.level_1;
  const Icon = c.icon;
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge className={`${c.className} gap-1 cursor-default`}>
          <Icon className={iconSize} />
          {size === "md" && <span>{c.label}</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{c.label}</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default KYCBadge;
