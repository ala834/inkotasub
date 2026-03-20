import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Check,
  Share2,
  AlertTriangle,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import inkotaLogo from "@/assets/inkota-logo.png";

interface Transaction {
  id: string;
  user_id: string;
  type: "credit" | "debit";
  amount: number;
  balance_before: number;
  balance_after: number;
  status: "pending" | "success" | "failed";
  description: string | null;
  reference: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

const networkLogos: Record<string, { bg: string; text: string; label: string }> = {
  mtn: { bg: "#FFCC00", text: "#000000", label: "MTN" },
  airtel: { bg: "#E40000", text: "#FFFFFF", label: "Airtel" },
  glo: { bg: "#00A651", text: "#FFFFFF", label: "Glo" },
  "9mobile": { bg: "#006B53", text: "#FFFFFF", label: "9mobile" },
};

const TransactionReceipt = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedRef, setCopiedRef] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchTransaction = async () => {
      if (!user || !id) return;
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (!error && data) {
        setTransaction({
          ...data,
          amount: parseFloat(data.amount as unknown as string),
          balance_before: parseFloat(data.balance_before as unknown as string),
          balance_after: parseFloat(data.balance_after as unknown as string),
          type: data.type as "credit" | "debit",
          status: data.status as "pending" | "success" | "failed",
          metadata: data.metadata as Record<string, any> | null,
        });
      }
      setLoading(false);
    };
    fetchTransaction();
  }, [user, id]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
    }).format(amount);

  const copyReference = () => {
    if (transaction?.reference) {
      navigator.clipboard.writeText(transaction.reference);
      setCopiedRef(true);
      toast.success("Reference copied!");
      setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  const detectNetwork = (): string | null => {
    const meta = transaction?.metadata;
    if (meta?.network) return meta.network.toLowerCase();
    const desc = transaction?.description?.toLowerCase() || "";
    for (const n of ["mtn", "airtel", "glo", "9mobile"]) {
      if (desc.includes(n)) return n;
    }
    return null;
  };

  const getServiceName = (): string => {
    const meta = transaction?.metadata;
    if (meta?.plan_name) return meta.plan_name;
    if (meta?.service_type) {
      const types: Record<string, string> = {
        airtime: "Airtime",
        data: "Data Bundle",
        electricity: "Electricity",
        cable: "Cable TV",
        exam_pin: "Result Checker",
      };
      return types[meta.service_type] || meta.service_type;
    }
    return transaction?.description || "Transaction";
  };

  const getRecipient = (): string | null => {
    return transaction?.metadata?.recipient || transaction?.metadata?.phone || null;
  };

  const getPaymentMethod = (): string => {
    return "Wallet Balance";
  };

  const generateReceiptImage = async (): Promise<Blob | null> => {
    if (!receiptRef.current) return null;
    // Show watermark elements during capture
    const watermarks = receiptRef.current.querySelectorAll("[data-watermark]");
    watermarks.forEach((el) => (el as HTMLElement).style.display = "flex");
    try {
      const dataUrl = await toPng(receiptRef.current, {
        pixelRatio: 3,
        backgroundColor: window.getComputedStyle(document.body).backgroundColor || "#ffffff",
      });
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch {
      return null;
    } finally {
      watermarks.forEach((el) => (el as HTMLElement).style.display = "none");
    }
  };

  const handleDownloadReceipt = async () => {
    toast.loading("Generating receipt image...", { id: "download" });
    const blob = await generateReceiptImage();
    if (!blob) {
      toast.error("Failed to generate image", { id: "download" });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `INKOTA-Receipt-${transaction!.reference || transaction!.id}.png`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Receipt downloaded!", { id: "download" });
  };

  const handleShareReceipt = async () => {
    toast.loading("Preparing receipt...", { id: "share" });
    const blob = await generateReceiptImage();

    if (blob && navigator.share && navigator.canShare?.({ files: [new File([blob], "receipt.png", { type: "image/png" })] })) {
      const file = new File([blob], `INKOTA-Receipt-${transaction!.reference || transaction!.id}.png`, { type: "image/png" });
      try {
        await navigator.share({
          title: "Transaction Receipt",
          text: `INKOTA SUB Receipt - ${formatCurrency(transaction!.amount)}`,
          files: [file],
        });
        toast.dismiss("share");
      } catch {
        toast.dismiss("share");
      }
    } else {
      // Fallback: download the image
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `INKOTA-Receipt-${transaction!.reference || transaction!.id}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Receipt downloaded — share it from your gallery!", { id: "share" });
      } else {
        // Text fallback
        const text = [
          "INKOTA SUB - Transaction Receipt",
          `Amount: ${formatCurrency(transaction!.amount)}`,
          `Status: ${transaction!.status.toUpperCase()}`,
          `Service: ${getServiceName()}`,
          getRecipient() ? `Recipient: ${getRecipient()}` : null,
          `Reference: ${transaction!.reference || transaction!.id}`,
          `Date: ${format(new Date(transaction!.created_at), "MMM d, yyyy h:mm a")}`,
        ].filter(Boolean).join("\n");
        navigator.clipboard.writeText(text);
        toast.success("Receipt text copied to clipboard!", { id: "share" });
      }
    }
  };

  const handleReportIssue = () => {
    navigate("/support", {
      state: {
        prefill: `Transaction Issue - Ref: ${transaction?.reference || transaction?.id}`,
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <XCircle className="h-16 w-16 text-destructive" />
        <p className="text-lg font-semibold">Transaction not found</p>
        <Button onClick={() => navigate(-1)} variant="outline">
          Go Back
        </Button>
      </div>
    );
  }

  const network = detectNetwork();
  const networkInfo = network ? networkLogos[network] : null;
  const statusConfig = {
    success: {
      icon: CheckCircle2,
      color: "text-success",
      bg: "bg-success/10",
      borderColor: "border-success/20",
      label: "Successful",
    },
    pending: {
      icon: Clock,
      color: "text-warning",
      bg: "bg-warning/10",
      borderColor: "border-warning/20",
      label: "Pending",
    },
    failed: {
      icon: XCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
      borderColor: "border-destructive/20",
      label: "Failed",
    },
  };
  const currentStatus = statusConfig[transaction.status];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold font-display">Transaction Receipt</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6" ref={receiptRef}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm"
        >
          {/* Top Section - Network & Amount */}
          <div className="px-6 pt-8 pb-6 text-center relative">
            {/* Decorative dots */}
            <div className="absolute top-0 left-0 right-0 flex justify-between px-2">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="w-3 h-3 bg-background rounded-full -mt-1.5" />
              ))}
            </div>

            {/* Network Logo */}
            {networkInfo ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12, delay: 0.1 }}
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md"
                style={{ backgroundColor: networkInfo.bg, color: networkInfo.text }}
              >
                <span className="text-lg font-bold">{networkInfo.label}</span>
              </motion.div>
            ) : (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12, delay: 0.1 }}
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-primary/10"
              >
                <StatusIcon className={cn("h-8 w-8", currentStatus.color)} />
              </motion.div>
            )}

            {/* Amount */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-3xl font-bold text-foreground mb-3"
            >
              {formatCurrency(transaction.amount)}
            </motion.p>

            {/* Status Badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Badge
                className={cn(
                  "px-4 py-1.5 text-sm font-semibold border",
                  currentStatus.bg,
                  currentStatus.color,
                  currentStatus.borderColor
                )}
              >
                <StatusIcon className="h-3.5 w-3.5 mr-1.5" />
                {currentStatus.label}
              </Badge>
            </motion.div>
          </div>

          {/* Tear line */}
          <div className="relative flex items-center">
            <div className="w-4 h-8 bg-background rounded-r-full -ml-px" />
            <div className="flex-1 border-t-2 border-dashed border-border mx-1" />
            <div className="w-4 h-8 bg-background rounded-l-full -mr-px" />
          </div>

          {/* Details Section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="px-6 py-5 space-y-0"
          >
            {getRecipient() && (
              <DetailRow label="Recipient" value={getRecipient()!} />
            )}

            <DetailRow label="Service" value={getServiceName()} />

            <DetailRow
              label="Transaction Type"
              value={transaction.type === "credit" ? "Credit" : "Debit"}
            />

            <DetailRow label="Payment Method" value={getPaymentMethod()} />

            {transaction.reference && (
              <div className="flex justify-between items-center py-3.5 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Reference</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-mono font-medium text-foreground truncate max-w-[140px]">
                    {transaction.reference}
                  </span>
                  <button
                    onClick={copyReference}
                    className="p-1 rounded-md hover:bg-muted transition-colors"
                  >
                    {copiedRef ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            )}

            <DetailRow
              label="Date"
              value={format(new Date(transaction.created_at), "MMM d, yyyy")}
            />

            <DetailRow
              label="Time"
              value={format(new Date(transaction.created_at), "h:mm:ss a")}
              noBorder
            />
          </motion.div>

          {/* Bottom decorative dots */}
          <div className="relative">
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="w-3 h-3 bg-background rounded-full mb-[-6px]" />
              ))}
            </div>
            <div className="h-3" />
          </div>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-3 mt-6"
        >
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-12 rounded-xl gap-2 border-border"
              onClick={handleDownloadReceipt}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button
              className="flex-1 h-12 rounded-xl gap-2 gradient-primary text-primary-foreground"
              onClick={handleShareReceipt}
            >
              <Share2 className="h-4 w-4" />
              Share Receipt
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full h-11 rounded-xl gap-2 text-muted-foreground hover:text-destructive"
            onClick={handleReportIssue}
          >
            <AlertTriangle className="h-4 w-4" />
            Report Issue
          </Button>
        </motion.div>

        {/* Branding - visible on screen */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          INKOTA SUB LTD • Powered by Lovable
        </p>

        {/* Watermark - hidden on screen, shown during image capture */}
        <div
          data-watermark
          className="items-center justify-center gap-2 mt-6 pb-2"
          style={{ display: "none" }}
        >
          <img src={inkotaLogo} alt="INKOTA SUB" className="w-8 h-8 rounded-lg" />
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">INKOTA SUB LTD</p>
            <p className="text-[10px] text-muted-foreground">www.inkotasub.com • Reliable VTU Services</p>
          </div>
        </div>

        {/* Diagonal watermark overlay - hidden on screen, shown during image capture */}
        <div
          data-watermark
          className="absolute inset-0 items-center justify-center overflow-hidden pointer-events-none"
          style={{ display: "none" }}
        >
          <div
            className="flex flex-col items-center gap-1 opacity-[0.07]"
            style={{ transform: "rotate(-35deg)" }}
          >
            <img src={inkotaLogo} alt="" className="w-16 h-16 rounded-xl" />
            <p className="text-2xl font-extrabold tracking-widest text-foreground whitespace-nowrap">
              INKOTA SUB LTD
            </p>
            <p className="text-xs font-semibold tracking-wider text-foreground whitespace-nowrap">
              www.inkotasub.com
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const DetailRow = ({
  label,
  value,
  noBorder = false,
}: {
  label: string;
  value: string;
  noBorder?: boolean;
}) => (
  <div
    className={cn(
      "flex justify-between items-center py-3.5",
      !noBorder && "border-b border-border/50"
    )}
  >
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground text-right max-w-[55%] truncate">
      {value}
    </span>
  </div>
);

export default TransactionReceipt;
