import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const RefundPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-6">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-display font-bold">Refund Policy</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="prose prose-sm dark:prose-invert max-w-none"
        >
          <div className="glass-card rounded-2xl p-6 space-y-6">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-2">Refund Policy</h1>
              <p className="text-muted-foreground">Last Updated: February 2025</p>
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">1. Overview</h2>
              <p className="text-muted-foreground leading-relaxed">
                At Inkotasub, we strive to provide reliable VTU services. This Refund Policy outlines 
                the conditions under which refunds may be issued for transactions made on our platform. 
                Please read this policy carefully before making any purchase.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">2. Eligible Refund Scenarios</h2>
              <p className="text-muted-foreground leading-relaxed">
                Refunds may be considered in the following circumstances:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Failed Transactions:</strong> When payment was deducted but the service was not delivered</li>
                <li><strong>Duplicate Charges:</strong> When you are charged multiple times for the same transaction</li>
                <li><strong>System Errors:</strong> When a technical error on our end causes transaction failure</li>
                <li><strong>Network Provider Failure:</strong> When the service fails due to network provider issues</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">3. Non-Refundable Transactions</h2>
              <p className="text-muted-foreground leading-relaxed">
                The following transactions are NOT eligible for refunds:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Successful Deliveries:</strong> Airtime, data, or any service successfully delivered to the recipient</li>
                <li><strong>Wrong Details:</strong> Transactions with incorrect phone numbers, meter numbers, or smartcard numbers provided by the user</li>
                <li><strong>Used Exam PINs:</strong> Exam cards that have been revealed/used</li>
                <li><strong>Third-Party Issues:</strong> Problems with the recipient's device, SIM card, or network</li>
                <li><strong>Delayed Processing:</strong> Transactions that are pending with the network provider</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">4. Refund Request Process</h2>
              <p className="text-muted-foreground leading-relaxed">
                To request a refund, follow these steps:
              </p>
              <ol className="list-decimal pl-6 text-muted-foreground space-y-2">
                <li><strong>Report Within 24 Hours:</strong> Contact us within 24 hours of the transaction</li>
                <li><strong>Provide Details:</strong> Include your transaction reference number, amount, and description of the issue</li>
                <li><strong>Contact Support:</strong> Email us at inkotasub123@gmail.com or message us on WhatsApp</li>
                <li><strong>Wait for Investigation:</strong> Our team will investigate within 48-72 hours</li>
                <li><strong>Receive Resolution:</strong> We will notify you of the outcome and process any approved refunds</li>
              </ol>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">5. Refund Methods</h2>
              <p className="text-muted-foreground leading-relaxed">
                Approved refunds will be processed as follows:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Wallet Credit:</strong> Refunds are credited directly to your Inkotasub wallet (default method)</li>
                <li><strong>Processing Time:</strong> Wallet refunds are processed within 24-48 hours of approval</li>
                <li><strong>Bank Transfer:</strong> Available for amounts above ₦10,000 upon request (may take 3-5 business days)</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">6. Service-Specific Policies</h2>
              
              <div className="space-y-4">
                <div className="bg-muted/30 rounded-xl p-4">
                  <h3 className="font-semibold text-foreground mb-2">Airtime & Data</h3>
                  <p className="text-muted-foreground text-sm">
                    Once airtime or data is successfully delivered to a phone number, no refund can be issued. 
                    Always verify the recipient number before confirming your transaction.
                  </p>
                </div>
                
                <div className="bg-muted/30 rounded-xl p-4">
                  <h3 className="font-semibold text-foreground mb-2">Electricity Bills</h3>
                  <p className="text-muted-foreground text-sm">
                    For prepaid meters, tokens are non-refundable once generated. For failed token generation 
                    where payment was deducted, we will refund or retry the transaction.
                  </p>
                </div>
                
                <div className="bg-muted/30 rounded-xl p-4">
                  <h3 className="font-semibold text-foreground mb-2">Cable TV</h3>
                  <p className="text-muted-foreground text-sm">
                    Cable TV subscriptions are non-refundable once the decoder is activated. Report issues 
                    with incorrect smartcard numbers before activation.
                  </p>
                </div>
                
                <div className="bg-muted/30 rounded-xl p-4">
                  <h3 className="font-semibold text-foreground mb-2">Exam Cards (WAEC, NECO, JAMB)</h3>
                  <p className="text-muted-foreground text-sm">
                    Exam PINs are non-refundable once revealed. If you receive an invalid or used PIN, 
                    report immediately with screenshot proof for investigation.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">7. Automatic Refunds</h2>
              <p className="text-muted-foreground leading-relaxed">
                In some cases, our system automatically processes refunds:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>When both primary and fallback providers fail to deliver the service</li>
                <li>When a transaction times out without confirmation</li>
                <li>When duplicate transactions are detected by our system</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                Automatic refunds are credited to your wallet and you will receive a notification.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">8. Dispute Resolution</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you are unsatisfied with a refund decision:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Request a review within 7 days of the initial decision</li>
                <li>Provide any additional evidence or documentation</li>
                <li>Our senior support team will conduct a final review</li>
                <li>The final decision will be communicated within 5 business days</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">9. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                For refund requests or questions about this policy, please contact us:
              </p>
              <div className="bg-muted/50 rounded-xl p-4 text-muted-foreground">
                <p><strong>Inkotasub Support Team</strong></p>
                <p>Email: inkotasub123@gmail.com</p>
                <p>WhatsApp: +234 903 422 6643</p>
                <p>Response Time: 24-48 hours</p>
              </div>
            </section>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default RefundPolicy;
