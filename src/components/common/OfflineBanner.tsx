import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WifiOff, RefreshCw, Wifi } from "lucide-react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * OPay-style offline status banner.
 * Non-blocking: sits at the top, lets the user keep using cached views.
 */
const OfflineBanner = () => {
  const isOnline = useOnlineStatus();
  const [isRetrying, setIsRetrying] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      setJustReconnected(false);
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setJustReconnected(true);
      toast.success("Back online", {
        description: "Your connection has been restored.",
      });
      const t = setTimeout(() => setJustReconnected(false), 2500);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

  const handleRetry = () => {
    setIsRetrying(true);
    // Give the browser a tick to re-check the network, then reload if online.
    setTimeout(() => {
      if (navigator.onLine) {
        window.location.reload();
      } else {
        setIsRetrying(false);
        toast.error("Still offline", {
          description: "Please check your internet connection and try again.",
        });
      }
    }, 900);
  };

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          key="offline"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed top-0 inset-x-0 z-[9997] px-3 pt-[env(safe-area-inset-top)]"
        >
          <div className="mx-auto max-w-lg mt-2 rounded-2xl bg-destructive text-destructive-foreground shadow-lg">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                <WifiOff className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">No internet connection</p>
                <p className="text-[11px] opacity-80 leading-tight truncate">
                  Please check your internet connection and try again.
                </p>
              </div>
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="h-8 px-3 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                {isRetrying ? "Checking" : "Retry"}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {justReconnected && (
        <motion.div
          key="online"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed top-0 inset-x-0 z-[9997] px-3 pt-[env(safe-area-inset-top)]"
        >
          <div className="mx-auto max-w-lg mt-2 rounded-2xl bg-emerald-600 text-white shadow-lg">
            <div className="flex items-center gap-3 px-4 py-2">
              <Wifi className="h-4 w-4" />
              <p className="text-sm font-semibold">Back online</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineBanner;
