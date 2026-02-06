import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, HelpCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ = () => {
  const navigate = useNavigate();

  const faqCategories = [
    {
      title: "Getting Started",
      faqs: [
        {
          question: "What is INKOTA SUB?",
          answer: "INKOTA SUB is a Nigerian VTU (Virtual Top-Up) platform that allows you to purchase airtime, data bundles, pay electricity bills, subscribe to cable TV, and buy exam cards (WAEC, NECO, JAMB) instantly from your mobile device."
        },
        {
          question: "How do I create an account?",
          answer: "Download the app or visit our website, click on 'Sign Up', enter your phone number, and follow the OTP verification process. Once verified, you can set up your transaction PIN and start using our services."
        },
        {
          question: "Is INKOTA SUB free to use?",
          answer: "Yes, creating an account and using our platform is completely free. You only pay for the services you purchase (airtime, data, electricity, etc.) at competitive rates."
        },
        {
          question: "What networks do you support?",
          answer: "We support all major Nigerian networks including MTN, Glo, Airtel, and 9mobile for airtime and data services."
        },
      ]
    },
    {
      title: "Wallet & Funding",
      faqs: [
        {
          question: "How do I fund my wallet?",
          answer: "You can fund your wallet via bank transfer to your unique virtual account number, card payment (Mastercard, Visa, Verve), or USSD. Bank transfers are credited automatically within seconds."
        },
        {
          question: "What is a virtual account?",
          answer: "Your virtual account is a unique bank account number assigned to you for funding your INKOTA SUB wallet. Any transfer to this account is automatically credited to your wallet instantly."
        },
        {
          question: "Is there a minimum funding amount?",
          answer: "Yes, the minimum funding amount is ₦100. There is no maximum limit for wallet funding."
        },
        {
          question: "How long does wallet funding take?",
          answer: "Bank transfers to your virtual account are usually credited within seconds. Card payments are instant. In rare cases, it may take up to 30 minutes during high traffic periods."
        },
        {
          question: "Can I withdraw money from my wallet?",
          answer: "Currently, wallet withdrawals are not supported. Your wallet balance can only be used for purchasing services on our platform. Please fund only the amount you intend to use."
        },
      ]
    },
    {
      title: "Transactions",
      faqs: [
        {
          question: "How do I buy airtime?",
          answer: "Go to 'Airtime' from the dashboard, enter the recipient's phone number (network is auto-detected), enter the amount, confirm with your PIN, and the airtime will be delivered instantly."
        },
        {
          question: "How do I buy data bundles?",
          answer: "Select 'Data Bundle' from the dashboard, enter the phone number, choose your preferred data plan from the available options, confirm with your PIN, and the data will be credited immediately."
        },
        {
          question: "What if I enter the wrong phone number?",
          answer: "Unfortunately, transactions to wrong numbers cannot be reversed once delivered. Please always double-check the recipient's phone number before confirming any transaction."
        },
        {
          question: "Why is my transaction pending?",
          answer: "Transactions may remain pending due to network delays. Most pending transactions are resolved within 5-30 minutes. If it remains pending after 1 hour, please contact our support team."
        },
        {
          question: "How do I check my transaction history?",
          answer: "Go to 'History' from the dashboard or Settings to view all your past transactions, including status, amount, and date."
        },
      ]
    },
    {
      title: "Electricity & Bills",
      faqs: [
        {
          question: "How do I pay for electricity?",
          answer: "Select 'Electricity' from the dashboard, choose your distribution company (Ikeja Electric, Eko Electric, etc.), enter your meter number, enter the amount, and confirm with your PIN. Your token will be displayed instantly."
        },
        {
          question: "What type of meters do you support?",
          answer: "We support both prepaid and postpaid meters across all major electricity distribution companies in Nigeria."
        },
        {
          question: "I didn't receive my electricity token. What should I do?",
          answer: "If your payment was successful but you didn't receive a token, please check your transaction history for the token number. If not available, contact support with your transaction reference."
        },
      ]
    },
    {
      title: "Cable TV",
      faqs: [
        {
          question: "Which cable TV providers do you support?",
          answer: "We support DSTV, GOtv, and StarTimes subscriptions."
        },
        {
          question: "How do I renew my cable TV subscription?",
          answer: "Select 'Cable TV' from the dashboard, choose your provider, enter your smartcard/IUC number, select a subscription package, and confirm with your PIN."
        },
        {
          question: "Can I change my subscription package?",
          answer: "Yes, you can subscribe to any available package. Your subscription will reflect on your decoder after a few minutes."
        },
      ]
    },
    {
      title: "Exam Cards",
      faqs: [
        {
          question: "Which exam cards are available?",
          answer: "We offer WAEC, NECO, NABTEB, and JAMB result checker PINs and exam registration cards."
        },
        {
          question: "How do I purchase an exam card?",
          answer: "Select 'Exam Cards' from the dashboard, choose the exam type (WAEC, NECO, etc.), select the quantity, confirm with your PIN, and your PINs will be delivered instantly."
        },
        {
          question: "What if my exam PIN doesn't work?",
          answer: "If you receive an invalid PIN, please contact support immediately with a screenshot of the PIN and error message. We will investigate and provide a replacement or refund if confirmed invalid."
        },
      ]
    },
    {
      title: "Security & Account",
      faqs: [
        {
          question: "What is a transaction PIN?",
          answer: "Your transaction PIN is a 4-digit code used to authorize all purchases on INKOTA SUB. Keep it confidential and never share it with anyone."
        },
        {
          question: "What happens if I forget my PIN?",
          answer: "Go to Settings > Security > Change Transaction PIN. You may need to verify your identity through OTP before resetting your PIN."
        },
        {
          question: "What if I enter the wrong PIN multiple times?",
          answer: "After 5 failed PIN attempts, your account will be temporarily locked for 30 minutes for security purposes. Contact support if you need immediate assistance."
        },
        {
          question: "Is my data safe with INKOTA SUB?",
          answer: "Yes, we use industry-standard encryption (SSL/TLS) and secure hashing (bcrypt) for all sensitive data. Your information is protected according to our Privacy Policy."
        },
      ]
    },
    {
      title: "Support & Issues",
      faqs: [
        {
          question: "How do I contact support?",
          answer: "You can reach us via Email at inkotasub123@gmail.com, WhatsApp at +234 903 422 6643, or through the in-app Support page."
        },
        {
          question: "What are your support hours?",
          answer: "Our support team is available Monday to Sunday, 8:00 AM to 10:00 PM (WAT). We aim to respond to all inquiries within 24 hours."
        },
        {
          question: "How do I report a failed transaction?",
          answer: "Go to your transaction history, find the failed transaction, and contact support with the transaction reference number. You can also email us directly with the details."
        },
        {
          question: "Can I get a refund for failed transactions?",
          answer: "Yes, failed transactions where payment was deducted are eligible for refunds. Please refer to our Refund Policy for detailed information on eligible scenarios."
        },
      ]
    },
  ];

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
            <HelpCircle className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-display font-bold">FAQ</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-2">Frequently Asked Questions</h1>
            <p className="text-muted-foreground">Find answers to common questions about INKOTA SUB</p>
          </div>

          {faqCategories.map((category, categoryIndex) => (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: categoryIndex * 0.1 }}
              className="glass-card rounded-2xl overflow-hidden"
            >
              <div className="bg-primary/5 px-4 py-3 border-b border-border/50">
                <h2 className="font-semibold text-foreground">{category.title}</h2>
              </div>
              <Accordion type="single" collapsible className="px-4">
                {category.faqs.map((faq, faqIndex) => (
                  <AccordionItem 
                    key={faqIndex} 
                    value={`${categoryIndex}-${faqIndex}`}
                    className="border-border/50"
                  >
                    <AccordionTrigger className="text-left text-sm font-medium py-4 hover:no-underline">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground text-sm pb-4">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          ))}

          {/* Contact Support Card */}
          <div className="glass-card rounded-2xl p-6 text-center">
            <HelpCircle className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Still have questions?</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <Button 
              onClick={() => navigate("/support")}
              className="gradient-primary text-primary-foreground"
            >
              Contact Support
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default FAQ;
