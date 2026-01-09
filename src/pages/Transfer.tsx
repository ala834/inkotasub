import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Search, Send, User } from "lucide-react";
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

const Transfer = () => {
  const navigate = useNavigate();
  const { wallet, refetch } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [recipientInfo, setRecipientInfo] = useState<{ name: string; phone: string } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const searchRecipient = async () => {
    if (!recipient.trim()) {
      toast.error("Enter phone number or email");
      return;
    }

    setIsSearching(true);
    try {
      // Search by phone number first
      const { data: profileByPhone } = await supabase
        .from("profiles")
        .select("full_name, phone_number")
        .eq("phone_number", recipient.trim())
        .single();

      if (profileByPhone) {
        setRecipientInfo({
          name: profileByPhone.full_name || "Unknown",
          phone: profileByPhone.phone_number || recipient,
        });
        toast.success("Recipient found!");
        return;
      }

      // If contains @, treat as email - we'll validate on submit
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

  const handleTransfer = async () => {
    if (!recipient.trim()) {
      toast.error("Enter recipient phone or email");
      return;
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    if (transferAmount > (wallet?.balance || 0)) {
      toast.error("Insufficient balance");
      return;
    }

    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke("transfer-funds", {
        body: {
          recipient_identifier: recipient.trim(),
          amount: transferAmount,
          description: description.trim() || undefined,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success(`Sent ₦${transferAmount.toLocaleString()} to ${data.data.recipient}`);
      refetch();
      navigate("/dashboard");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Transfer failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="min-h-screen gradient-hero pb-24">
      <Header />

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </button>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Transfer Money
          </h1>
          <p className="text-muted-foreground">
            Send money to other INKOTA users
          </p>
        </motion.div>

        {/* Balance Display */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4 rounded-2xl mb-6"
        >
          <p className="text-sm text-muted-foreground">Available Balance</p>
          <p className="text-2xl font-bold text-primary">
            {formatCurrency(wallet?.balance || 0)}
          </p>
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
              <Button
                variant="outline"
                size="icon"
                onClick={searchRecipient}
                disabled={isSearching}
              >
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
            onClick={handleTransfer}
            disabled={isLoading || !recipient || !amount}
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
    </div>
  );
};

export default Transfer;
