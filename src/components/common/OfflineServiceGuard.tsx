import { motion } from "framer-motion";
import { WifiOff, RefreshCw, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface Props {
  /** Service label shown in the empty state, e.g. "Airtime" */
  title?: string;
}

/**
 * Shown inside service pages (Airtime, Data, Electricity, TV, Transfer)
 * when the device is offline. Replaces the page's loading/network UI
 * with a clear "No Internet Connection" card — no spinners forever.
 */
const OfflineServiceGuard = ({ title }: Props) => {
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const [isRetrying, setIsRetrying] = useState(false);

  if (isOnline) return null;

  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => {
      if (navigator.onLine) {
        window.location.reload();
      } else {
        setIsRetrying(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center active:scale-95 transition-transform"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        {title && <h1 className="text-base font-semibold text-gray-900">{title}</h1>}
      </div>

      <div className="flex-1 flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-3xl border border-gray-200/80 shadow-sm p-6 text-center"
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <WifiOff className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">No Internet Connection</h2>
          <p className="text-sm text-gray-500 mb-5">
            Please check your internet connection and try again.
          </p>
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 active:opacity-90 transition-opacity disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
            {isRetrying ? "Checking…" : "Retry"}
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default OfflineServiceGuard;
