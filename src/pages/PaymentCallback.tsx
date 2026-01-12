import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const PaymentCallback = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [message, setMessage] = useState("Verifying your payment...");

  useEffect(() => {
    const verifyPayment = async () => {
      const reference = searchParams.get("reference") || searchParams.get("trxref");

      if (!reference) {
        setStatus("failed");
        setMessage("Invalid payment reference");
        return;
      }

      try {
        // Verify payment via edge function
        const { data, error } = await supabase.functions.invoke("verify-payment", {
          body: { reference },
        });

        if (error) throw error;

        if (data?.status === "success") {
          setStatus("success");
          setMessage(`Payment of ₦${data.amount?.toLocaleString()} was successful!`);
        } else {
          setStatus("failed");
          setMessage(data?.message || "Payment verification failed");
        }
      } catch (error: any) {
        console.error("Payment verification error:", error);
        setStatus("failed");
        setMessage(error.message || "Failed to verify payment");
      }
    };

    verifyPayment();
  }, [searchParams]);

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card rounded-3xl p-8 max-w-md w-full text-center"
      >
        {status === "loading" && (
          <>
            <Loader2 className="h-16 w-16 text-primary mx-auto mb-4 animate-spin" />
            <h1 className="text-xl font-display font-bold mb-2">Processing Payment</h1>
            <p className="text-muted-foreground">{message}</p>
          </>
        )}

        {status === "success" && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 10 }}
            >
              <CheckCircle className="h-20 w-20 text-green-500 mx-auto mb-4" />
            </motion.div>
            <h1 className="text-2xl font-display font-bold mb-2 text-green-600">
              Payment Successful!
            </h1>
            <p className="text-muted-foreground mb-6">{message}</p>
            <div className="space-y-3">
              <Button
                onClick={() => navigate("/dashboard")}
                className="w-full gradient-primary text-primary-foreground rounded-xl h-12"
              >
                Go to Dashboard
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/history")}
                className="w-full rounded-xl h-12"
              >
                View Transactions
              </Button>
            </div>
          </>
        )}

        {status === "failed" && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 10 }}
            >
              <XCircle className="h-20 w-20 text-red-500 mx-auto mb-4" />
            </motion.div>
            <h1 className="text-2xl font-display font-bold mb-2 text-red-600">
              Payment Failed
            </h1>
            <p className="text-muted-foreground mb-6">{message}</p>
            <div className="space-y-3">
              <Button
                onClick={() => navigate("/fund-wallet")}
                className="w-full gradient-primary text-primary-foreground rounded-xl h-12"
              >
                Try Again
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/dashboard")}
                className="w-full rounded-xl h-12"
              >
                Back to Dashboard
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default PaymentCallback;
