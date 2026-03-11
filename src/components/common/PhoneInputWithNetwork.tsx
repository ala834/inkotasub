import { useEffect, useState } from "react";
import { Phone, AlertCircle, CheckCircle2, Contact } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNetworkDetection, NETWORK_INFO } from "@/hooks/useNetworkDetection";
import NetworkBadge from "@/components/common/NetworkBadge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PhoneInputWithNetworkProps {
  value: string;
  onChange: (value: string) => void;
  onNetworkDetected?: (network: string | null) => void;
  onContactSelected?: (name: string | undefined) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const PhoneInputWithNetwork = ({
  value,
  onChange,
  onNetworkDetected,
  onContactSelected,
  label = "Phone Number",
  placeholder = "08012345678",
  className,
  disabled = false
}: PhoneInputWithNetworkProps) => {
  const { network, networkInfo, isValid, normalizedNumber, error } = useNetworkDetection(value);
  const [contactSupported] = useState(() =>
    typeof window !== "undefined" && "contacts" in navigator && "ContactsManager" in window
  );

  // Notify parent of network changes
  useEffect(() => {
    onNetworkDetected?.(network);
  }, [network, onNetworkDetected]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const cleaned = inputValue.replace(/[^\d+]/g, "");
    if (cleaned.length <= 14) {
      onChange(cleaned);
    }
  };

  const handlePickContact = async () => {
    try {
      const contacts = await (navigator as any).contacts.select(
        ["name", "tel"],
        { multiple: false }
      );
      if (contacts && contacts.length > 0) {
        const contact = contacts[0];
        const tel = contact.tel?.[0];
        if (tel) {
          // Normalize: remove spaces, dashes
          let num = tel.replace(/[\s\-()]/g, "");
          // Convert +234 to 0
          if (num.startsWith("+234")) {
            num = "0" + num.slice(4);
          }
          onChange(num);
          const contactName = contact.name?.[0];
          onContactSelected?.(contactName);
        }
      }
    } catch (err: any) {
      if (err.name !== "InvalidStateError" && err.name !== "NotAllowedError") {
        toast.error("Could not access contacts");
      }
    }
  };

  const showNetworkBadge = network && normalizedNumber.length >= 4;
  const showError = error && normalizedNumber.length >= 4;
  const showValid = isValid && network;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor="phone-input">{label}</Label>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
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

        {contactSupported && (
          <button
            type="button"
            onClick={handlePickContact}
            disabled={disabled}
            className="flex-shrink-0 w-12 h-12 rounded-xl border border-input bg-background hover:bg-accent flex items-center justify-center transition-colors disabled:opacity-50"
            title="Select from contacts"
          >
            <Contact className="h-5 w-5 text-primary" />
          </button>
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
