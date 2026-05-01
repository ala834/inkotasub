import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
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
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-display font-bold">Privacy Policy</h1>
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
              <h1 className="text-2xl font-bold text-foreground mb-2">Privacy Policy</h1>
              <p className="text-muted-foreground">Last Updated: February 2025</p>
            </div>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">1. Introduction</h2>
              <p className="text-muted-foreground leading-relaxed">
                Welcome to Inkotasub ("we", "our", or "us"). We are committed to protecting your personal 
                information and your right to privacy. This Privacy Policy explains how we collect, use, 
                disclose, and safeguard your information when you use our mobile application and services 
                for purchasing airtime, data bundles, electricity tokens, cable TV subscriptions, and exam cards.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">2. Information We Collect</h2>
              <p className="text-muted-foreground leading-relaxed">
                We collect information that you provide directly to us, including:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Personal Information:</strong> Full name, email address, phone number, and profile picture</li>
                <li><strong>Account Information:</strong> Transaction PIN, login credentials, and security preferences</li>
                <li><strong>Transaction Data:</strong> Purchase history, payment details, recipient phone numbers for airtime/data</li>
                <li><strong>Device Information:</strong> Device type, operating system, and unique device identifiers</li>
                <li><strong>Financial Information:</strong> Virtual account details, wallet balance, and funding history</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">3. How We Use Your Information</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use the information we collect to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Process your transactions (airtime, data, electricity, cable TV, exam cards)</li>
                <li>Create and manage your Inkotasub account</li>
                <li>Provide customer support and respond to your inquiries</li>
                <li>Send transaction confirmations, receipts, and notifications</li>
                <li>Improve our services and develop new features</li>
                <li>Detect and prevent fraud, unauthorized transactions, and security threats</li>
                <li>Comply with legal obligations and regulatory requirements</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">4. Data Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We implement industry-standard security measures to protect your personal information:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>All data transmissions are encrypted using SSL/TLS technology</li>
                <li>Transaction PINs are securely hashed using bcrypt encryption</li>
                <li>Account lockout protection after multiple failed PIN attempts</li>
                <li>Regular security audits and vulnerability assessments</li>
                <li>Secure cloud infrastructure with access controls</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">5. Information Sharing</h2>
              <p className="text-muted-foreground leading-relaxed">
                We do not sell your personal information. We may share your information with:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Service Providers:</strong> Third-party vendors who assist in delivering our services (payment processors, telecom networks)</li>
                <li><strong>Legal Requirements:</strong> When required by law, court order, or government regulations</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                <li><strong>With Your Consent:</strong> When you have given us explicit permission</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">6. Your Rights</h2>
              <p className="text-muted-foreground leading-relaxed">
                You have the right to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Access and receive a copy of your personal data</li>
                <li>Update or correct inaccurate information</li>
                <li>Request deletion of your account and associated data</li>
                <li>Opt-out of marketing communications</li>
                <li>Withdraw consent where applicable</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">7. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed">
                We retain your personal information for as long as your account is active or as needed to 
                provide services. Transaction records are kept for a minimum of 7 years to comply with 
                Nigerian financial regulations and for audit purposes.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">8. Children's Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                Inkotasub services are not intended for individuals under the age of 18. We do not 
                knowingly collect personal information from children. If you believe we have collected 
                information from a minor, please contact us immediately.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">9. Changes to This Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any significant 
                changes by posting the new policy in the app and updating the "Last Updated" date. Your 
                continued use of our services after changes constitutes acceptance of the revised policy.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">10. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have questions or concerns about this Privacy Policy or our data practices, 
                please contact us at:
              </p>
              <div className="bg-muted/50 rounded-xl p-4 text-muted-foreground">
                <p><strong>Inkotasub Technologies</strong></p>
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

export default PrivacyPolicy;
