import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Loader2, Minus, Plus, Copy, Check, Eye, EyeOff,
  Printer, Download, Share2, CreditCard, RefreshCw
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseEdgeFunctionError } from "@/lib/edge-function-errors";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import TransactionConfirmationDialog from "@/components/common/TransactionConfirmationDialog";
import { NETWORKS } from "@/components/common/NetworkLogos";

interface RechargeCardPin {
  pin: string;
  serial?: string;
  network: string;
  amount: number;
}

const cardAmounts = [100, 200, 500, 1000, 2000, 5000];

const networkColors: Record<string, string> = {
  mtn: "#FFCC00",
  airtel: "#E40000",
  glo: "#00A651",
  "9mobile": "#006B53",
};

const RechargeCard = () => {
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const printRef = useRef<HTMLDivElement>(null);

  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const [showResult, setShowResult] = useState(false);
  const [purchasedPins, setPurchasedPins] = useState<RechargeCardPin[]>([]);
  const [purchaseRef, setPurchaseRef] = useState("");
  const [revealedPins, setRevealedPins] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const totalAmount = (selectedAmount || 0) * quantity;

  const validateForm = () => {
    if (!selectedNetwork) { toast.error("Please select a network"); return false; }
    if (!selectedAmount) { toast.error("Please select a card amount"); return false; }
    if (quantity < 1 || quantity > 20) { toast.error("Quantity must be 1-20"); return false; }
    if (wallet && totalAmount > wallet.balance) { toast.error("Insufficient wallet balance"); return false; }
    return true;
  };

  const handlePurchaseClick = () => { if (validateForm()) setShowConfirmDialog(true); };
  const handleConfirmPay = () => { setShowConfirmDialog(false); setShowPinDialog(true); };

  const handlePurchaseWithPin = async (pin: string) => {
    if (!selectedNetwork || !selectedAmount) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-recharge-card", {
        body: { network: selectedNetwork.toUpperCase(), amount: selectedAmount, quantity, transaction_pin: pin },
      });
      if (error || !data?.success) {
        const message = parseEdgeFunctionError(error, data, "Failed to purchase recharge cards");
        if (!message.includes("PIN") && !message.includes("locked")) toast.error(message);
        throw new Error(message);
      }
      toast.success("Recharge cards purchased successfully!");
      if (data.pins && data.pins.length > 0) {
        setPurchasedPins(data.pins);
        setPurchaseRef(data.reference || "");
        setRevealedPins(new Set());
        setShowResult(true);
      } else { navigate("/history"); }
    } catch (error: any) {
      throw new Error(error.message || "Failed to purchase recharge cards");
    } finally { setIsLoading(false); }
  };

  const handleCopyPin = (pin: string, index: number) => {
    navigator.clipboard.writeText(pin);
    setCopiedIndex(index);
    toast.success("PIN copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleRevealPin = (index: number) => {
    setRevealedPins(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const handlePrint = () => {
    setRevealedPins(new Set(purchasedPins.map((_, i) => i)));
    setTimeout(() => {
      const printWindow = window.open("", "_blank");
      if (!printWindow) { toast.error("Please allow popups to print"); return; }
      const escapeHtml = (s: string | number) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      printWindow.document.write(`
        <html><head><title>Inkotasub - Recharge Cards</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; padding: 20px; }
          .card { border: 2px dashed #ccc; padding: 16px; margin: 12px 0; border-radius: 8px; page-break-inside: avoid; }
          .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
          .network { font-weight: bold; font-size: 18px; }
          .amount { font-size: 16px; color: #333; }
          .pin { font-family: monospace; font-size: 20px; font-weight: bold; letter-spacing: 2px; margin: 8px 0; }
          .serial { font-size: 12px; color: #666; }
          .footer { text-align: center; margin-top: 20px; color: #999; font-size: 12px; }
          @media print { body { padding: 0; } }
        </style></head><body>
        <h2 style="text-align:center">Inkotasub - Recharge Cards</h2>
        <p style="text-align:center;color:#666">Ref: ${escapeHtml(purchaseRef)}</p>
        ${purchasedPins.map(p => `
          <div class="card">
            <div class="card-header">
              <span class="network">${escapeHtml(p.network)}</span>
              <span class="amount">₦${escapeHtml(p.amount.toLocaleString())}</span>
            </div>
            <div class="pin">${escapeHtml(p.pin)}</div>
            ${p.serial ? `<div class="serial">S/N: ${escapeHtml(p.serial)}</div>` : ""}
          </div>
        `).join("")}
        <div class="footer">Generated by Inkotasub Ltd | ${escapeHtml(new Date().toLocaleDateString())}</div>
        </body></html>
      `);
      printWindow.document.close();
      printWindow.print();
    }, 100);
  };

  const handleDownloadPDF = () => {
    setRevealedPins(new Set(purchasedPins.map((_, i) => i)));
    const content = `Inkotasub - Recharge Card PINs\nRef: ${purchaseRef}\nDate: ${new Date().toLocaleString()}\n${"=".repeat(40)}\n\n${purchasedPins.map((p, i) => `Card ${i + 1}:\n  Network: ${p.network}\n  Amount: ₦${p.amount.toLocaleString()}\n  PIN: ${p.pin}${p.serial ? `\n  Serial: ${p.serial}` : ""}\n${"─".repeat(30)}`).join("\n")}\n\nGenerated by Inkotasub Ltd`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recharge-cards-${purchaseRef}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("File downloaded!");
  };

  const handleShare = async () => {
    setRevealedPins(new Set(purchasedPins.map((_, i) => i)));
    const text = purchasedPins.map((p, i) =>
      `Card ${i + 1}: ${p.network} ₦${p.amount.toLocaleString()}\nPIN: ${p.pin}${p.serial ? `\nS/N: ${p.serial}` : ""}`
    ).join("\n\n");
    const shareData = { title: "Inkotasub - Recharge Cards", text: `Recharge Card PINs (Ref: ${purchaseRef})\n\n${text}\n\nGenerated by Inkotasub Ltd` };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(shareData.text);
      toast.success("Copied to clipboard!");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Green Header */}
      <header className="bg-gradient-to-r from-green-600 to-green-500 px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Recharge Card</h1>
        <div className="w-10" />
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto space-y-5">
        {/* Wallet Balance */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">Wallet Balance</p>
            <p className="text-xl font-bold text-gray-900">₦{wallet?.balance.toLocaleString() || "0.00"}</p>
          </div>
          <button onClick={() => navigate("/fund-wallet")} className="px-4 py-2 bg-green-50 text-green-600 font-semibold text-sm rounded-xl border border-green-200 active:bg-green-100 transition-colors">
            Fund Wallet
          </button>
        </motion.div>

        {/* Network Selection */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">Select Network</p>
          <div className="grid grid-cols-4 gap-3">
            {NETWORKS.map(net => (
              <motion.button
                key={net.id}
                whileTap={{ scale: 0.93 }}
                onClick={() => setSelectedNetwork(net.id)}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                  selectedNetwork === net.id
                    ? "border-green-500 shadow-lg shadow-green-500/20 bg-green-50/50"
                    : "border-gray-100 bg-white hover:border-gray-200"
                )}
              >
                <img src={net.logo} alt={net.name} className="w-12 h-12 rounded-2xl object-contain shadow-sm" />
                <span className={cn("text-xs font-medium", selectedNetwork === net.id ? "text-green-600" : "text-gray-500")}>
                  {net.name}
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Card Amount Selection */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">Card Amount</p>
          <div className="grid grid-cols-3 gap-2">
            {cardAmounts.map(amt => (
              <motion.button
                key={amt}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedAmount(amt)}
                className={cn(
                  "h-12 rounded-xl border-2 text-center font-bold text-sm transition-all",
                  selectedAmount === amt
                    ? "border-green-500 bg-green-50 text-green-600 shadow-md shadow-green-500/10"
                    : "border-gray-100 bg-white text-gray-700 hover:border-gray-200"
                )}
              >
                ₦{amt.toLocaleString()}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Quantity & Summary */}
        <AnimatePresence>
          {selectedNetwork && selectedAmount && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
                <p className="text-sm font-semibold text-gray-700">Number of Cards</p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="w-11 h-11 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-600 active:bg-gray-100 disabled:opacity-40 transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="flex-1 text-center">
                    <span className="text-3xl font-bold text-gray-900">{quantity}</span>
                  </div>
                  <button
                    onClick={() => setQuantity(Math.min(20, quantity + 1))}
                    disabled={quantity >= 20}
                    className="w-11 h-11 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-600 active:bg-gray-100 disabled:opacity-40 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Network</span>
                    <span className="font-medium text-gray-900">{selectedNetwork?.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Card Value</span>
                    <span className="font-medium text-gray-900">₦{selectedAmount?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Quantity</span>
                    <span className="font-medium text-gray-900">×{quantity}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="text-xl font-bold text-green-600">₦{totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Sticky Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] z-40">
        <div className="max-w-lg mx-auto">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handlePurchaseClick}
            disabled={isLoading || !selectedNetwork || !selectedAmount}
            className={cn(
              "w-full h-14 rounded-2xl font-bold text-lg transition-all shadow-lg",
              selectedNetwork && selectedAmount
                ? "bg-gradient-to-r from-green-600 to-green-500 text-white active:from-green-700 active:to-green-600 shadow-green-500/25"
                : "bg-gray-200 text-gray-400"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            ) : selectedNetwork && selectedAmount ? (
              `Buy ${quantity} Card${quantity > 1 ? "s" : ""} for ₦${totalAmount.toLocaleString()}`
            ) : (
              "Select network & amount"
            )}
          </motion.button>
        </div>
      </div>

      <TransactionConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={handleConfirmPay}
        title="Confirm Recharge Card Purchase"
        amount={totalAmount}
        walletBalanceAfter={(wallet?.balance || 0) - totalAmount}
        details={[
          { label: "Service", value: "Recharge Card" },
          { label: "Network", value: selectedNetwork?.toUpperCase() || "" },
          { label: "Card Value", value: `₦${(selectedAmount || 0).toLocaleString()}` },
          { label: "Quantity", value: `${quantity}` },
        ]}
      />

      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handlePurchaseWithPin}
        title="Confirm Purchase"
        description="Enter your PIN to buy recharge cards"
        amount={totalAmount}
        serviceName={`${selectedNetwork?.toUpperCase()} Recharge Card x${quantity}`}
      />

      {/* Purchased Cards Result */}
      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-sm mx-auto max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-green-500" />
              Recharge Cards Ready
            </DialogTitle>
            <DialogDescription>
              Your {purchasedPins.length} card{purchasedPins.length > 1 ? "s are" : " is"} ready. Print, download, or share.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mt-2">
            <button onClick={handlePrint} className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 text-sm font-medium active:bg-gray-100 transition-colors">
              <Printer className="h-4 w-4" /> Print
            </button>
            <button onClick={handleDownloadPDF} className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 text-sm font-medium active:bg-gray-100 transition-colors">
              <Download className="h-4 w-4" /> Download
            </button>
            <button onClick={handleShare} className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 text-sm font-medium active:bg-gray-100 transition-colors">
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>

          <div ref={printRef} className="space-y-3 mt-2">
            {purchasedPins.map((card, index) => (
              <div key={index} className="rounded-xl border-2 border-dashed p-4 space-y-2" style={{ borderColor: networkColors[card.network.toLowerCase()] || "#e5e7eb" }}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm" style={{ color: networkColors[card.network.toLowerCase()] }}>{card.network}</span>
                  <span className="font-bold text-gray-900">₦{card.amount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="flex-1 text-base font-mono font-bold text-gray-900 break-all">
                    {revealedPins.has(index) ? card.pin : "••••••••••••••"}
                  </code>
                  <div className="flex gap-1">
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors" onClick={() => toggleRevealPin(index)}>
                      {revealedPins.has(index) ? <EyeOff className="h-4 w-4 text-gray-500" /> : <Eye className="h-4 w-4 text-gray-500" />}
                    </button>
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors" onClick={() => handleCopyPin(card.pin, index)}>
                      {copiedIndex === index ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-500" />}
                    </button>
                  </div>
                </div>
                {card.serial && <p className="text-xs text-gray-400">S/N: {card.serial}</p>}
              </div>
            ))}
            {purchaseRef && <p className="text-xs text-gray-400 text-center">Ref: {purchaseRef}</p>}
          </div>

          <button
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold mt-2 active:from-green-700 active:to-green-600 transition-colors"
            onClick={() => { setShowResult(false); navigate("/history"); }}
          >
            View Transaction History
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RechargeCard;
