import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, Send, User, Loader2, AlertCircle, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useWallet } from "@/hooks/useWallet";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import TransferConfirmationDialog from "@/components/transfer/TransferConfirmationDialog";

const TRANSFER_FEE = 10;
const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000];

const Transfer = () => {
  const navigate = useNavigate();
  const { wallet, refetch } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [recipientInfo, setRecipientInfo] = useState<{ name: string; phone: string } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const searchRecipient = async () => {
    if (!recipient.trim()) { toast.error("Enter phone number or email"); return; }
    setIsSearching(true);
    try {
      const { data: profileByPhone } = await supabase
        .from("profiles")
        .select("full_name, phone_number")
        .eq("phone_number", recipient.trim())
        .single();

      if (profileByPhone) {
        setRecipientInfo({ name: profileByPhone.full_name || "Unknown User", phone: profileByPhone.phone_number || recipient });
        toast.success("Recipient found!");
        return;
      }

      if (recipient.includes("@")) {
        setRecipientInfo({ name: recipient.split("@")[0], phone: recipient });
        toast.info("Email will be verified on transfer");
        return;
      }

      toast.error("Recipient not found");
      setRecipientInfo(null);
    } catch {
      toast.error("Recipient not found");
      setRecipientInfo(null);
    } finally {
      setIsSearching(false);
    }
  };

  const transferAmount = parseFloat(amount) || 0;
  const totalDeduction = transferAmount + TRANSFER_FEE;

  const validateForm = () => {
    if (!recipientInfo) { toast.error("Search for a recipient first"); return false; }
    if (transferAmount <= 0) { toast.error("Enter a valid amount"); return false; }
    if (totalDeduction > (wallet?.balance || 0)) { toast.error("Insufficient balance (including ₦10 fee)"); return false; }
    return true;
  };

  const handleTransferClick = () => { if (validateForm()) setShowConfirmDialog(true); };
  const handleConfirmTransfer = () => { setShowConfirmDialog(false); setShowPinDialog(true); };

  const handleTransferWithPin = async (pin: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("transfer-funds", {
        body: { recipient_identifier: recipient.trim(), amount: transferAmount, description: description.trim() || undefined, transaction_pin: pin },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success(`Sent ₦${transferAmount.toLocaleString()} to ${data.data.recipient}`);
      refetch();
      navigate("/dashboard");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Transfer failed";
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Green Header */}
      <header className="bg-gradient-to-r from-green-600 to-green-500 px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Transfer Money</h1>
        <div className="w-10" />
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto space-y-5">
        {/* Wallet Balance */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">Available Balance</p>
            <p className="text-xl font-bold text-gray-900">₦{wallet?.balance.toLocaleString() || "0.00"}</p>
          </div>
          <button onClick={() => navigate("/fund-wallet")} className="px-4 py-2 bg-green-50 text-green-600 font-semibold text-sm rounded-xl border border-green-200 active:bg-green-100 transition-colors">
            Fund Wallet
          </button>
        </motion.div>

        {/* Recipient Search */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Recipient</p>
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={recipient}
                onChange={(e) => { setRecipient(e.target.value); setRecipientInfo(null); }}
                placeholder="Phone number or email"
                className="w-full h-12 pl-11 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-base"
              />
            </div>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={searchRecipient}
              disabled={isSearching}
              className="flex-shrink-0 w-12 h-12 rounded-xl bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors active:bg-green-700 disabled:opacity-50"
            >
              {isSearching ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Search className="h-5 w-5 text-white" />}
            </motion.button>
          </div>

          {/* Recipient Found */}
          <AnimatePresence>
            {recipientInfo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <User className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{recipientInfo.name}</p>
                    <p className="text-xs text-gray-500">{recipientInfo.phone}</p>
                  </div>
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Amount Input */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Amount</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400">₦</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="1"
              className="w-full h-16 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-2xl text-2xl font-bold text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-center"
            />
          </div>

          {/* Quick Amounts */}
          <div className="grid grid-cols-3 gap-2">
            {QUICK_AMOUNTS.map(amt => (
              <motion.button
                key={amt}
                whileTap={{ scale: 0.95 }}
                onClick={() => setAmount(amt.toString())}
                className={cn(
                  "h-10 rounded-xl border-2 text-sm font-bold transition-all",
                  amount === amt.toString()
                    ? "border-green-500 bg-green-50 text-green-600 shadow-md shadow-green-500/10"
                    : "border-gray-100 bg-white text-gray-700 hover:border-gray-200"
                )}
              >
                ₦{amt.toLocaleString()}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Description */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Note (Optional)</p>
          <div className="relative">
            <MessageSquare className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this for?"
              rows={2}
              className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-sm resize-none"
            />
          </div>
        </motion.div>

        {/* Transfer Breakdown */}
        <AnimatePresence>
          {transferAmount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Transfer Amount</span>
                  <span className="font-medium text-gray-900">₦{transferAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> Transfer Fee
                  </span>
                  <span className="font-medium text-gray-900">₦{TRANSFER_FEE.toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-100 pt-2 flex justify-between">
                  <span className="font-semibold text-gray-900 text-sm">Total Deduction</span>
                  <span className="text-lg font-bold text-green-600">₦{totalDeduction.toLocaleString()}</span>
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
            onClick={handleTransferClick}
            disabled={isLoading || !recipientInfo || !amount || transferAmount <= 0}
            className={cn(
              "w-full h-14 rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-2",
              recipientInfo && transferAmount > 0
                ? "bg-gradient-to-r from-green-600 to-green-500 text-white active:from-green-700 active:to-green-600 shadow-green-500/25"
                : "bg-gray-200 text-gray-400"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : recipientInfo && transferAmount > 0 ? (
              <>
                <Send className="h-5 w-5" />
                Send ₦{transferAmount.toLocaleString()}
              </>
            ) : (
              "Enter recipient & amount"
            )}
          </motion.button>
        </div>
      </div>

      <TransferConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={handleConfirmTransfer}
        recipientName={recipientInfo?.name || ""}
        recipientIdentifier={recipientInfo?.phone || ""}
        amount={transferAmount}
        fee={TRANSFER_FEE}
        total={totalDeduction}
      />

      <PinEntryDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        onSubmit={handleTransferWithPin}
        title="Confirm Transfer"
        description="Enter your PIN to send money"
        amount={totalDeduction}
        serviceName={`Transfer to ${recipientInfo?.name || recipient}`}
      />
    </div>
  );
};

export default Transfer;
