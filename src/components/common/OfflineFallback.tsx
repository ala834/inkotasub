import { useState, useEffect, useRef } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLogo from "@/components/common/AppLogo";
import { toast } from "sonner";

const OfflineFallback = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isRetrying, setIsRetrying] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    const goOffline = () => { setIsOffline(true); wasOffline.current = true; };
    const goOnline = () => {
      setIsOffline(false);
      if (wasOffline.current) {
        toast.success("You're back online!", { description: "Your connection has been restored." });
        wasOffline.current = false;
      }
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => {
      if (navigator.onLine) {
        window.location.reload();
      } else {
        setIsRetrying(false);
      }
    }, 1500);
  };

  if (!isOffline) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center text-center max-w-sm">
        <AppLogo className="w-16 h-16 mb-6 opacity-60" />

        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-5">
          <WifiOff className="h-8 w-8 text-destructive" />
        </div>

        <h1 className="text-xl font-display font-bold text-foreground mb-2">
          You're Offline
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Please check your internet connection and try again. Your data is safe and will sync when you reconnect.
        </p>

        <Button
          onClick={handleRetry}
          disabled={isRetrying}
          className="white green-primary text-primary-foreground rounded-xl h-12 px-8"
        >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
          {isRetrying ? "Checking…" : "Try Again"}
        </Button>
      </div>
    </div>
  );
};

export default OfflineFallback;
