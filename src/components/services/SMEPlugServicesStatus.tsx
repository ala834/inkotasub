import { motion } from "framer-motion";
import { Smartphone, Wifi, Zap, Tv, AlertCircle, Loader2 } from "lucide-react";
import { useSMEPlugServices } from "@/hooks/useSMEPlugServices";

const serviceIcons: Record<string, React.ElementType> = {
  airtime: Smartphone,
  data: Wifi,
  electricity: Zap,
  cable: Tv,
  "cable-tv": Tv,
};

const serviceColors: Record<string, string> = {
  airtime: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
  data: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
  electricity: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
  cable: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)",
  "cable-tv": "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)",
};

const SMEPlugServicesStatus = () => {
  const { services, isLoading, error } = useSMEPlugServices();

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl p-4 shadow-sm border border-border/50"
      >
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading provider services...</span>
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-destructive/10 rounded-2xl p-4 border border-destructive/20"
      >
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      </motion.div>
    );
  }

  if (services.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-muted/50 rounded-2xl p-4 border border-border/50"
      >
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">No services available from provider</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl p-4 shadow-sm border border-border/50"
    >
      <h4 className="text-sm font-medium text-muted-foreground mb-3">Provider Services (SMEPlug)</h4>
      <div className="flex flex-wrap gap-2">
        {services.map((service) => {
          const Icon = serviceIcons[service.slug] || Smartphone;
          const color = serviceColors[service.slug] || "linear-gradient(135deg, #6B7280 0%, #374151 100%)";
          
          return (
            <div
              key={service.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50"
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: color }}
              >
                <Icon className="h-3 w-3 text-white" />
              </div>
              <span className="text-xs font-medium">{service.name}</span>
              {service.is_active !== false && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" title="Active" />
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default SMEPlugServicesStatus;
