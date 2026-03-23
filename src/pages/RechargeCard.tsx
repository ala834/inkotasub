import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Loader2, Minus, Plus, Copy, Check, Eye, EyeOff,
  Printer, Download, Share2, CreditCard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseEdgeFunctionError } from "@/lib/edge-function-errors";
import NetworkBadge from "@/components/common/NetworkBadge";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import TransactionConfirmationDialog from "@/components/common/TransactionConfirmationDialog";

interface RechargeCardPin {
  pin: string;
  serial?: string;
  network: string;
  amount: number;
}

const networks = ["mtn", "airtel", "glo", "9mobile"] as const;
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

  // Result state
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

  const handlePurchaseClick = () => {
    if (validateForm()) setShowConfirmDialog(true);
  };

  const handleConfirmPay = () => {
    setShowConfirmDialog(false);
    setShowPinDialog(true);
  };

  const handlePurchaseWithPin = async (pin: string) => {
    if (!selectedNetwork || !selectedAmount) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-recharge-card", {
        body: {
          network: selectedNetwork.toUpperCase(),
          amount: selectedAmount,
          quantity,
          transaction_pin: pin,
        },
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
      } else {
        navigate("/history");
      }
    } catch (error: any) {
      throw new Error(error.message || "Failed to purchase recharge cards");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPin = (pin: string, index: number) => {
    navigator.clipboard.writeText(pin);
    setCopiedIndex(index);
    toast.success("PIN copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleRevealPin = (index: number) => {
    setRevealedPins((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handlePrint = () => {
    // Reveal all PINs before printing
    setRevealedPins(new Set(purchasedPins.map((_, i) => i)));
    setTimeout(() => {
      const content = printRef.current;
      if (!content) return;
      const printWindow = window.open("", "_blank");
      if (!printWindow) { toast.error("Please allow popups to print"); return; }
      printWindow.document.write(`
        <html><head><title>INKOTA SUB - Recharge Cards</title>
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
        <h2 style="text-align:center">INKOTA SUB - Recharge Cards</h2>
        <p style="text-align:center;color:#666">Ref: ${purchaseRef}</p>
        ${purchasedPins.map((p, i) => `
          <div class="card">
            <div class="card-header">
              <span class="network">${p.network}</span>
              <span class="amount">₦${p.amount.toLocaleString()}</span>
            </div>
            <div class="pin">${p.pin}</div>
            ${p.serial ? `<div class="serial">S/N: ${p.serial}</div>` : ""}
          </div>
        `).join("")}
        <div class="footer">Generated by INKOTA SUB LTD | ${new Date().toLocaleDateString()}</div>
        </body></html>
      `);
      printWindow.document.close();
      printWindow.print();
    }, 100);
  };

  const handleDownloadPDF = () => {
    // Generate a downloadable text/HTML file as a simple PDF alternative
    setRevealedPins(new Set(purchasedPins.map((_, i) => i)));
    const content = `
INKOTA SUB - Recharge Card PINs
Ref: ${purchaseRef}
Date: ${new Date().toLocaleString()}
${"=".repeat(40)}

${purchasedPins.map((p, i) => `
Card ${i + 1}:
  Network: ${p.network}
  Amount: ₦${p.amount.toLocaleString()}
  PIN: ${p.pin}${p.serial ? `\n  Serial: ${p.serial}` : ""}
${"─".repeat(30)}`).join("\n")}

Generated by INKOTA SUB LTD
    `.trim();

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

    const shareData = {
      title: "INKOTA SUB - Recharge Cards",
      text: `Recharge Card PINs (Ref: ${purchaseRef})\n\n${text}\n\nGenerated by INKOTA SUB LTD`,
    };

    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(shareData.text);
      toast.success("Copied to clipboard!");
    }
  };

  return (
    <div className="min-h-screen gradient-hero pb-6">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-display font-bold">Recharge Card</h1>
            <p className="text-xs text-muted-foreground">Purchase & print recharge card PINs</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          {/* Wallet Balance */}
          <div className="relative overflow-hidden rounded-2xl gradient-primary p-5 text-primary-foreground">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm opacity-80">Wallet Balance</p>
                <p className="text-2xl font-bold mt-0.5">₦{wallet?.balance.toLocaleString() || "0.00"}</p>
              </div>
              <Button
                variant="secondary" size="sm" onClick={() => navigate("/fund-wallet")}
                className="rounded-xl bg-white/20 hover:bg-white/30 text-primary-foreground border-0"
              >
                Fund Wallet
              </Button>
            </div>
          </div>

          {/* Network Selection */}
          <div>
            <Label className="text-muted-foreground mb-3 block text-sm font-medium">Select Network</Label>
            <div className="flex gap-3 justify-center">
              {networks.map((net) => (
                <NetworkBadge
                  key={net}
                  network={net}
                  size="lg"
                  selected={selectedNetwork === net}
                  onClick={() => setSelectedNetwork(net)}
                />
              ))}
            </div>
          </div>

          {/* Card Amount */}
          <div>
            <Label className="text-muted-foreground mb-3 block text-sm font-medium">Card Amount</Label>
            <div className="grid grid-cols-3 gap-2">
              {cardAmounts.map((amt) => (
                <motion.button
                  key={amt}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedAmount(amt)}
                  className={cn(
                    "p-3 rounded-xl border-2 text-center font-bold transition-all",
                    selectedAmount === amt
                      ? "border-primary bg-primary/10 text-primary shadow-md"
                      : "border-border bg-card text-foreground hover:border-primary/40"
                  )}
                >
                  ₦{amt.toLocaleString()}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <AnimatePresence>
            {selectedNetwork && selectedAmount && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="glass-card rounded-2xl p-5 space-y-4">
                  <Label className="text-muted-foreground text-sm font-medium">Number of Cards</Label>
                  <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1} className="rounded-xl h-11 w-11">
                      <Minus className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 text-center">
                      <span className="text-3xl font-bold text-foreground">{quantity}</span>
                    </div>
                    <Button variant="outline" size="icon" onClick={() => setQuantity(Math.min(20, quantity + 1))} disabled={quantity >= 20} className="rounded-xl h-11 w-11">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="border-t border-border/50 pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Network</span>
                      <span className="font-medium text-foreground">{selectedNetwork?.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Card Value</span>
                      <span className="font-medium text-foreground">₦{selectedAmount?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Quantity</span>
                      <span className="font-medium text-foreground">×{quantity}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border/50">
                      <span className="font-semibold text-foreground">Total</span>
                      <span className="text-xl font-bold text-primary">₦{totalAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <Button
            onClick={handlePurchaseClick}
            disabled={isLoading || !selectedNetwork || !selectedAmount}
            className="w-full h-14 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg shadow-lg hover:shadow-xl transition-shadow"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : selectedNetwork && selectedAmount ? (
              `Buy ${quantity} Recharge Card${quantity > 1 ? "s" : ""}`
            ) : (
              "Select network & amount"
            )}
          </Button>
        </motion.div>
      </main>

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

      {/* Purchased Cards Result Dialog */}
      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-sm mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-primary" />
              Recharge Cards Ready
            </DialogTitle>
            <DialogDescription>
              Your {purchasedPins.length} recharge card{purchasedPins.length > 1 ? "s are" : " is"} ready. Print, download, or share them.
            </DialogDescription>
          </DialogHeader>

          {/* Action buttons */}
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handlePrint}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleDownloadPDF}>
              <Download className="h-4 w-4" /> Download
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleShare}>
              <Share2 className="h-4 w-4" /> Share
            </Button>
          </div>

          <div ref={printRef} className="space-y-3 mt-2">
            {purchasedPins.map((card, index) => (
              <div
                key={index}
                className="rounded-xl border-2 border-dashed p-4 space-y-2"
                style={{ borderColor: networkColors[card.network.toLowerCase()] || "var(--border)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm" style={{ color: networkColors[card.network.toLowerCase()] }}>
                    {card.network}
                  </span>
                  <span className="font-bold text-foreground">₦{card.amount.toLocaleString()}</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <code className="flex-1 text-base font-mono font-bold text-foreground break-all">
                    {revealedPins.has(index) ? card.pin : "••••••••••••••"}
                  </code>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleRevealPin(index)}>
                      {revealedPins.has(index) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyPin(card.pin, index)}>
                      {copiedIndex === index ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {card.serial && (
                  <p className="text-xs text-muted-foreground">S/N: {card.serial}</p>
                )}
              </div>
            ))}

            {purchaseRef && (
              <p className="text-xs text-muted-foreground text-center">Ref: {purchaseRef}</p>
            )}
          </div>

          <Button
            className="w-full mt-2"
            onClick={() => { setShowResult(false); navigate("/history"); }}
          >
            View Transaction History
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RechargeCard;
