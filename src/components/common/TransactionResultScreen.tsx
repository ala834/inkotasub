import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Share2, UserPlus, Home, Copy, ReceiptText, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface TransactionDetail {
  label: string;
  value: string;
}

interface TransactionResultScreenProps {
  open: boolean;
  onClose: () => void;
  success: boolean;
  /** When true, render a "Processing..." state — provider response was indeterminate. */
  pending?: boolean;
  amount: number;
  details: TransactionDetail[];
  transactionId?: string;
  errorMessage?: string;
  onSaveBeneficiary?: () => void;
  receiptId?: string;
}

const TransactionResultScreen = ({
  open,
  onClose,
  success,
  pending = false,
  amount,
  details,
  transactionId,
  errorMessage,
  onSaveBeneficiary,
  receiptId,
}: TransactionResultScreenProps) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  // Live status overrides while polling on a Processing screen.
  // null = use the props as-is; otherwise reflect the latest status from the server.
  const [liveStatus, setLiveStatus] = useState<"pending" | "success" | "failed" | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveReceiptId, setLiveReceiptId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  // Reset live state whenever a new transaction is shown.
  useEffect(() => {
    if (open) {
      setLiveStatus(null);
      setLiveError(null);
      setLiveReceiptId(null);
      attemptsRef.current = 0;
    }
  }, [open, transactionId]);

  // Effective values used for rendering — prefer live data once we have it.
  const effectivePending = liveStatus === null ? pending : liveStatus === "pending";
  const effectiveSuccess = liveStatus === null ? success : liveStatus === "success";
  const effectiveError = liveError ?? errorMessage;
  const effectiveReceiptId = liveReceiptId ?? receiptId;

  // Poll + realtime-subscribe to the transaction while in Processing state.
  useEffect(() => {
    if (!open || !effectivePending || !transactionId) return;

    let cancelled = false;
    const MAX_ATTEMPTS = 60; // ~5 minutes at 5s interval
    const INTERVAL_MS = 5000;

    const checkStatus = async () => {
      if (cancelled) return;
      try {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, status, reference, description, metadata")
          .eq("reference", transactionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled || error || !data) return;

        if (data.status === "success") {
          setLiveStatus("success");
          setLiveReceiptId(data.id);
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        } else if (data.status === "failed") {
          setLiveStatus("failed");
          const meta = (data.metadata as Record<string, unknown> | null) ?? null;
          const msg =
            (meta && typeof meta.provider_message === "string"
              ? (meta.provider_message as string)
              : null) ||
            data.description ||
            "Transaction failed. Please contact support if you were debited.";
          setLiveError(msg);
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        }
      } catch {
        // Ignore network blips — next interval will retry.
      }
    };

    // Immediate check, then interval polling.
    checkStatus();
    pollTimerRef.current = setInterval(() => {
      attemptsRef.current += 1;
      if (attemptsRef.current >= MAX_ATTEMPTS && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        return;
      }
      checkStatus();
    }, INTERVAL_MS);

    // Realtime subscription for instant update once backend reconciles.
    const channel = supabase
      .channel(`txn-status-${transactionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `reference=eq.${transactionId}`,
        },
        () => {
          checkStatus();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [open, effectivePending, transactionId]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(value);

  const handleShare = async () => {
    const text = [
      success ? "✅ Transaction Successful" : "❌ Transaction Failed",
      `Amount: ${formatCurrency(amount)}`,
      ...details.map((d) => `${d.label}: ${d.value}`),
      transactionId ? `Ref: ${transactionId}` : "",
      `Date: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`,
      "",
      "Powered by INKOTA SUB",
    ]
      .filter(Boolean)
      .join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: "Transaction Receipt", text });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success("Receipt copied to clipboard!");
    }
  };

  const handleCopyRef = async () => {
    if (transactionId) {
      await navigator.clipboard.writeText(transactionId);
      setCopied(true);
      toast.success("Reference copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGoHome = () => {
    onClose();
    navigate("/dashboard");
  };

  const handleViewReceipt = () => {
    if (receiptId) {
      onClose();
      navigate(`/receipt/${receiptId}`);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="w-full max-w-sm space-y-6"
          >
            {/* Status Icon */}
            <div className="flex justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2, damping: 12, stiffness: 200 }}
                className="relative"
              >
                {/* Ripple rings */}
                {success && (
                  <>
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0.6 }}
                      animate={{ scale: 2, opacity: 0 }}
                      transition={{ duration: 1.2, delay: 0.3 }}
                      className="absolute inset-0 rounded-full bg-emerald-500/20"
                    />
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0.4 }}
                      animate={{ scale: 1.6, opacity: 0 }}
                      transition={{ duration: 1, delay: 0.5 }}
                      className="absolute inset-0 rounded-full bg-emerald-500/30"
                    />
                  </>
                )}

                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.15, damping: 10 }}
                  className={`w-24 h-24 rounded-full flex items-center justify-center ${
                    pending
                      ? "bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/30"
                      : success
                      ? "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30"
                      : "bg-gradient-to-br from-red-400 to-red-600 shadow-lg shadow-red-500/30"
                  }`}
                >
                  <motion.div
                    initial={{ pathLength: 0 }}
                    animate={pending ? { rotate: 360 } : { pathLength: 1 }}
                    transition={pending ? { duration: 2, repeat: Infinity, ease: "linear" } : { duration: 0.5, delay: 0.4 }}
                  >
                    {pending ? (
                      <Clock className="h-12 w-12 text-white" strokeWidth={2.5} />
                    ) : success ? (
                      <Check className="h-12 w-12 text-white" strokeWidth={3} />
                    ) : (
                      <X className="h-12 w-12 text-white" strokeWidth={3} />
                    )}
                  </motion.div>
                </motion.div>
              </motion.div>
            </div>

            {/* Status Text */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-center space-y-1"
            >
              <h2 className="text-2xl font-display font-bold text-foreground">
                {pending ? "Processing..." : success ? "Transaction Successful!" : "Transaction Failed"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {pending
                  ? (errorMessage || "Your transaction is being confirmed. We'll update the status shortly.")
                  : success
                  ? "Your transaction was completed successfully"
                  : errorMessage || "Something went wrong. Please try again."}
              </p>
            </motion.div>

            {/* Amount */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-center"
            >
              <p className={`text-4xl font-bold ${pending ? "text-amber-600" : success ? "text-emerald-600" : "text-red-500"}`}>
                {formatCurrency(amount)}
              </p>
            </motion.div>

            {/* Details Card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="glass-card rounded-2xl p-4 space-y-3"
            >
              {details.map((detail, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{detail.label}</span>
                  <span className="font-medium text-foreground">{detail.value}</span>
                </div>
              ))}

              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Date & Time</span>
                <span className="font-medium text-foreground">
                  {format(new Date(), "dd MMM yyyy, hh:mm a")}
                </span>
              </div>

              {transactionId && (
                <div className="flex justify-between items-center text-sm pt-2 border-t border-border">
                  <span className="text-muted-foreground">Transaction ID</span>
                  <button
                    onClick={handleCopyRef}
                    className="flex items-center gap-1 text-primary font-mono text-xs hover:underline"
                  >
                    {transactionId.slice(0, 12)}...
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              )}
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="space-y-3"
            >
              {success && (
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleShare}
                    className="flex-1 h-12 rounded-xl gap-2"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </Button>
                  {receiptId && (
                    <Button
                      variant="outline"
                      onClick={handleViewReceipt}
                      className="flex-1 h-12 rounded-xl gap-2"
                    >
                      <ReceiptText className="h-4 w-4" />
                      Receipt
                    </Button>
                  )}
                  {onSaveBeneficiary && (
                    <Button
                      variant="outline"
                      onClick={onSaveBeneficiary}
                      className="flex-1 h-12 rounded-xl gap-2"
                    >
                      <UserPlus className="h-4 w-4" />
                      Save
                    </Button>
                  )}
                </div>
              )}

              <Button
                onClick={handleGoHome}
                className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold"
              >
                <Home className="h-4 w-4 mr-2" />
                {pending ? "Check Transaction History" : success ? "Back to Dashboard" : "Try Again"}
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TransactionResultScreen;
