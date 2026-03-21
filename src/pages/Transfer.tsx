import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Search, Send, User, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import { useWallet } from "@/hooks/useWallet";
import { supabase } from "@/integrations/supabase/client";
import PinEntryDialog from "@/components/common/PinEntryDialog";
import TransferConfirmationDialog from "@/components/transfer/TransferConfirmationDialog";

const TRANSFER_FEE = 10;

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
    if (!recipient.trim()) {
      toast.error("Enter phone number or email");
      return;
    }

    setIsSearching(true);
    try {
      const { data: profileByPhone } = await supabase
        .from("profiles")
        .select("full_name, phone_number")
        .eq("phone_number", recipient.trim())
        .single();

      if (profileByPhone) {
        setRecipientInfo({
          name: profileByPhone.full_name || "Unknown User",
          phone: profileByPhone.phone_number || recipient,
        });
        toast.success("Recipient found!");
        return;
      }

      if (recipient.includes("@")) {
        setRecipientInfo({
          name: recipient.split("@")[0],
          phone: recipient,
        });
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
    if (!recipientInfo) {
      toast.error("Search for a recipient first");
      return false;
    }
    if (transferAmount <= 0) {
      toast.error("Enter a valid amount");
      return false;
    }
    if (totalDeduction > (wallet?.balance || 0)) {
      toast.error("Insufficient balance (including ₦10 fee)");
      return false;
    }
    return true;
  };

  const handleTransferClick = () => {
    if (validateForm()) {
      setShowConfirmDialog(true);
    }
  };

  const handleConfirmTransfer = () => {
    setShowConfirmDialog(false);
    setShowPinDialog(true);
  };

  const handleTransferWithPin = async (pin: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("transfer-funds", {
        body: {
          recipient_identifier: recipient.trim(),
          amount: transferAmount,
          description: description.trim() || undefined,
          transaction_pin: pin,
        },
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
    }).format(value);

  return (
    <div className="min-h-screen gradient-hero pb-24">
      <Header />

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </button>
          <h1 className="text-2xl font-display font-bold text-foreground">Transfer Money</h1>
          <p className="text-muted-foreground">Send money to other INKOTA users</p>
        </motion.div>

        {/* Balance Display */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4 rounded-2xl mb-6"
        >
          <p className="text-sm text-muted-foreground">Available Balance</p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(wallet?.balance || 0)}</p>
        </motion.div>

        {/* Transfer Form */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          {/* Recipient Input */}
          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient (Phone or Email)</Label>
            <div className="flex gap-2">
              <Input
                id="recipient"
                type="text"
                placeholder="e.g., 08012345678 or user@email.com"
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setRecipientInfo(null);
                }}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={searchRecipient} disabled={isSearching}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Recipient Info */}
          {recipientInfo && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl"
            >
              <div className="p-2 bg-primary/20 rounded-full">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{recipientInfo.name}</p>
                <p className="text-sm text-muted-foreground">{recipientInfo.phone}</p>
              </div>
            </motion.div>
          )}

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₦)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
            />
          </div>

          {/* Transfer Breakdown */}
          {transferAmount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-4 rounded-xl space-y-2"
            >
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Transfer Amount</span>
                <span className="font-medium text-foreground">{formatCurrency(transferAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Transfer Fee
                </span>
                <span className="font-medium text-foreground">{formatCurrency(TRANSFER_FEE)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between text-sm font-semibold">
                <span className="text-foreground">Total Deduction</span>
                <span className="text-primary">{formatCurrency(totalDeduction)}</span>
              </div>
            </motion.div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="What's this for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Transfer Button */}
          <Button
            onClick={handleTransferClick}
            disabled={isLoading || !recipientInfo || !amount}
            className="w-full h-12 text-lg"
          >
            {isLoading ? (
              "Processing..."
            ) : (
              <>
                <Send className="h-5 w-5 mr-2" />
                Send Money
              </>
            )}
          </Button>
        </motion.div>
      </main>

      <BottomNav />

      {/* Confirmation Dialog */}
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

      {/* PIN Entry Dialog */}
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
