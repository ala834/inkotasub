import { useEffect } from "react";
import { Phone, AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNetworkDetection, NETWORK_INFO } from "@/hooks/useNetworkDetection";
import NetworkBadge from "@/components/common/NetworkBadge";
import { cn } from "@/lib/utils";

interface PhoneInputWithNetworkProps {
  value: string;
  onChange: (value: string) => void;
  onNetworkDetected?: (network: string | null) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const PhoneInputWithNetwork = ({
  value,
  onChange,
  onNetworkDetected,
  label = "Phone Number",
  placeholder = "08012345678",
  className,
  disabled = false
}: PhoneInputWithNetworkProps) => {
  const { network, networkInfo, isValid, normalizedNumber, error } = useNetworkDetection(value);

  // Notify parent of network changes
  useEffect(() => {
    onNetworkDetected?.(network);
  }, [network, onNetworkDetected]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits and + at the start
    const inputValue = e.target.value;
    const cleaned = inputValue.replace(/[^\d+]/g, "");
    
    // Limit to reasonable length
    if (cleaned.length <= 14) {
      onChange(cleaned);
    }
  };

  const showNetworkBadge = network && normalizedNumber.length >= 4;
  const showError = error && normalizedNumber.length >= 4;
  const showValid = isValid && network;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor="phone-input">{label}</Label>
      <div className="relative">
        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
        <Input
          id="phone-input"
          type="tel"
          inputMode="numeric"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "pl-10 pr-24 h-12 rounded-xl transition-all",
            showError && "border-destructive focus-visible:ring-destructive",
            showValid && "border-green-500 focus-visible:ring-green-500"
          )}
        />
        
        {/* Network badge display */}
        {showNetworkBadge && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <NetworkBadge 
              network={network as "mtn" | "airtel" | "glo" | "9mobile"} 
              size="sm"
            />
            {showValid && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
          </div>
        )}
      </div>

      {/* Status messages */}
      <div className="min-h-[20px]">
        {showError && (
          <div className="flex items-center gap-1 text-destructive text-xs">
            <AlertCircle className="h-3 w-3" />
            <span>{error}</span>
          </div>
        )}
        {showValid && !showError && (
          <div className="flex items-center gap-1 text-green-600 text-xs">
            <CheckCircle2 className="h-3 w-3" />
            <span>{networkInfo?.name} number detected</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhoneInputWithNetwork;
