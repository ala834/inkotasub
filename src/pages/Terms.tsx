import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const Terms = () => {
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
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-display font-bold">Terms & Conditions</h1>
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
              <h1 className="text-2xl font-bold text-foreground mb-2">Terms & Conditions</h1>
              <p className="text-muted-foreground">Last Updated: February 2025</p>
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By creating an account or using INKOTA SUB services, you agree to be bound by these Terms 
                and Conditions. If you do not agree to these terms, please do not use our services. These 
                terms apply to all users of our VTU (Virtual Top-Up) platform in Nigeria.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">2. Services Provided</h2>
              <p className="text-muted-foreground leading-relaxed">
                INKOTA SUB provides the following digital services:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Airtime Purchase:</strong> Buy MTN, Glo, Airtel, and 9mobile airtime</li>
                <li><strong>Data Bundles:</strong> Purchase mobile data plans for all Nigerian networks</li>
                <li><strong>Electricity Bills:</strong> Pay for prepaid and postpaid electricity tokens</li>
                <li><strong>Cable TV:</strong> Subscribe to DSTV, GOtv, and StarTimes</li>
                <li><strong>Exam Cards:</strong> Purchase WAEC, NECO, NABTEB, and JAMB scratch cards</li>
                <li><strong>Wallet Services:</strong> Fund and manage your digital wallet</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">3. User Responsibilities</h2>
              <p className="text-muted-foreground leading-relaxed">
                As a user of INKOTA SUB, you agree to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Provide accurate and complete registration information</li>
                <li>Keep your login credentials and transaction PIN confidential</li>
                <li>Verify recipient details (phone numbers, meter numbers, smartcard numbers) before completing transactions</li>
                <li>Not use our services for any illegal or unauthorized purposes</li>
                <li>Not attempt to interfere with the proper functioning of the platform</li>
                <li>Notify us immediately of any unauthorized access to your account</li>
                <li>Use the platform in compliance with all applicable Nigerian laws</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">4. Account Registration</h2>
              <p className="text-muted-foreground leading-relaxed">
                To use INKOTA SUB services, you must:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Be at least 18 years of age</li>
                <li>Register with a valid Nigerian phone number</li>
                <li>Create a secure transaction PIN for authorizing purchases</li>
                <li>Verify your identity as required by Nigerian financial regulations</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to suspend or terminate accounts that violate these terms or engage 
                in suspicious activities.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">5. Payments and Transactions</h2>
              <p className="text-muted-foreground leading-relaxed">
                All transactions on INKOTA SUB are processed in Nigerian Naira (₦). By making a purchase:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>You authorize us to deduct the transaction amount from your wallet balance</li>
                <li>All successful transactions are final and binding</li>
                <li>Transaction receipts are sent via notification and available in transaction history</li>
                <li>Prices are subject to change based on network provider rates</li>
                <li>We are not responsible for delays caused by network providers</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">6. Wallet Funding</h2>
              <p className="text-muted-foreground leading-relaxed">
                You can fund your INKOTA SUB wallet through:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Bank transfer to your unique virtual account number</li>
                <li>Card payments (Mastercard, Visa, Verve)</li>
                <li>USSD payments</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                Wallet credits are processed automatically upon successful payment confirmation. 
                Minimum funding amount is ₦100.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">7. Transaction Disputes</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you experience issues with a transaction:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Report the issue within 24 hours of the transaction</li>
                <li>Provide your transaction reference number</li>
                <li>Contact our support team via email or WhatsApp</li>
                <li>We will investigate and respond within 48-72 hours</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">8. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                INKOTA SUB shall not be liable for:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Transactions made to incorrect recipient details provided by the user</li>
                <li>Service interruptions caused by network providers</li>
                <li>Losses resulting from unauthorized access due to user negligence</li>
                <li>Force majeure events beyond our reasonable control</li>
                <li>Indirect, incidental, or consequential damages</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">9. Intellectual Property</h2>
              <p className="text-muted-foreground leading-relaxed">
                All content, trademarks, logos, and intellectual property on INKOTA SUB are owned by us 
                or our licensors. You may not copy, reproduce, or distribute any content without our 
                express written permission.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">10. Modifications to Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to modify these Terms and Conditions at any time. Changes will be 
                effective upon posting in the app. Continued use of our services after changes constitutes 
                acceptance of the modified terms.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">11. Governing Law</h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms and Conditions are governed by the laws of the Federal Republic of Nigeria. 
                Any disputes shall be resolved in the courts of Lagos State, Nigeria.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">12. Contact Information</h2>
              <p className="text-muted-foreground leading-relaxed">
                For questions about these Terms and Conditions, please contact us:
              </p>
              <div className="bg-muted/50 rounded-xl p-4 text-muted-foreground">
                <p><strong>INKOTA SUB Technologies</strong></p>
                <p>Email: inkotasub123@gmail.com</p>
                <p>Phone: +234 903 422 6643</p>
                <p>Address: Lagos, Nigeria</p>
              </div>
            </section>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default Terms;
