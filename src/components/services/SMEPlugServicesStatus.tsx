import { motion } from "framer-motion";
import { 
  Smartphone, 
  Wifi, 
  Zap, 
  Tv, 
  AlertCircle, 
  Loader2, 
  GraduationCap, 
  Banknote,
  Package,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useSMEPlugServices, SMEPlugService } from "@/hooks/useSMEPlugServices";
import { useState } from "react";

// Icon mapping for different service types
const getServiceIcon = (slug: string): React.ElementType => {
  const normalizedSlug = slug.toLowerCase();
  
  if (normalizedSlug.includes("airtime") && !normalizedSlug.includes("cash")) {
    return Smartphone;
  }
  if (normalizedSlug.includes("data") || normalizedSlug.includes("bundle")) {
    return Wifi;
  }
  if (normalizedSlug.includes("electric") || normalizedSlug.includes("power")) {
    return Zap;
  }
  if (normalizedSlug.includes("cable") || normalizedSlug.includes("tv") || normalizedSlug.includes("dstv") || normalizedSlug.includes("gotv")) {
    return Tv;
  }
  if (normalizedSlug.includes("exam") || normalizedSlug.includes("waec") || normalizedSlug.includes("neco") || normalizedSlug.includes("jamb") || normalizedSlug.includes("education")) {
    return GraduationCap;
  }
  if (normalizedSlug.includes("cash") || normalizedSlug.includes("a2c") || normalizedSlug.includes("convert")) {
    return Banknote;
  }
  
  return Package;
};

// Color mapping for different service types
const getServiceColor = (slug: string): string => {
  const normalizedSlug = slug.toLowerCase();
  
  if (normalizedSlug.includes("airtime") && !normalizedSlug.includes("cash")) {
    return "linear-gradient(135deg, #10B981 0%, #059669 100%)";
  }
  if (normalizedSlug.includes("data") || normalizedSlug.includes("bundle")) {
    return "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)";
  }
  if (normalizedSlug.includes("electric") || normalizedSlug.includes("power")) {
    return "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)";
  }
  if (normalizedSlug.includes("cable") || normalizedSlug.includes("tv")) {
    return "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)";
  }
  if (normalizedSlug.includes("exam") || normalizedSlug.includes("waec") || normalizedSlug.includes("neco") || normalizedSlug.includes("jamb") || normalizedSlug.includes("education")) {
    return "linear-gradient(135deg, #EC4899 0%, #BE185D 100%)";
  }
  if (normalizedSlug.includes("cash") || normalizedSlug.includes("a2c") || normalizedSlug.includes("convert")) {
    return "linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)";
  }
  
  return "linear-gradient(135deg, #6B7280 0%, #374151 100%)";
};

const ServiceBadge = ({ service }: { service: SMEPlugService }) => {
  const Icon = getServiceIcon(service.slug);
  const color = getServiceColor(service.slug);
  const isActive = service.is_active !== false;
  
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
        isActive ? "bg-muted/50" : "bg-muted/20 opacity-50"
      }`}
      title={service.description || service.name}
    >
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center"
        style={{ background: color }}
      >
        <Icon className="h-3 w-3 text-primary-foreground" />
      </div>
      <span className="text-xs font-medium">{service.name}</span>
      {isActive && (
        <span className="w-2 h-2 rounded-full bg-primary" title="Active" />
      )}
      {!isActive && (
        <span className="w-2 h-2 rounded-full bg-muted-foreground" title="Inactive" />
      )}
    </div>
  );
};

const SMEPlugServicesStatus = () => {
  const { services, categories, missingCategories, isLoading, error } = useSMEPlugServices();
  const [showAll, setShowAll] = useState(false);

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

  // Show first 5 services by default, or all if expanded
  const displayServices = showAll ? services : services.slice(0, 5);
  const hasMore = services.length > 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl p-4 shadow-sm border border-border/50"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-muted-foreground">
          Provider Services ({services.length} active)
        </h4>
        {categories.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {categories.length} categories
          </span>
        )}
      </div>
      
      <div className="flex flex-wrap gap-2">
        {displayServices.map((service) => (
          <ServiceBadge key={service.id || service.slug} service={service} />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-1 mt-3 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {showAll ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Show all ({services.length - 5} more)
            </>
          )}
        </button>
      )}

      {missingCategories.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive">⚠</span> Some categories may not be available: {missingCategories.slice(0, 3).join(", ")}
            {missingCategories.length > 3 && ` +${missingCategories.length - 3} more`}
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default SMEPlugServicesStatus;
