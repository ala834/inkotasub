import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, HelpCircle, Search, MessageCircle, ChevronDown } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import BottomNav from "@/components/layout/BottomNav";

const faqCategories = [
  {
    title: "Getting Started",
    faqs: [
      { question: "What is Inkotasub?", answer: "Inkotasub is a Nigerian VTU (Virtual Top-Up) platform that allows you to purchase airtime, data bundles, pay electricity bills, subscribe to cable TV, and buy exam cards (WAEC, NECO, JAMB) instantly from your mobile device." },
      { question: "How do I create an account?", answer: "Download the app or visit our website, click on 'Sign Up', enter your phone number, and follow the OTP verification process. Once verified, you can set up your transaction PIN and start using our services." },
      { question: "Is Inkotasub free to use?", answer: "Yes, creating an account and using our platform is completely free. You only pay for the services you purchase (airtime, data, electricity, etc.) at competitive rates." },
      { question: "What networks do you support?", answer: "We support all major Nigerian networks including MTN, Glo, Airtel, and 9mobile for airtime and data services." },
    ]
  },
  {
    title: "Wallet & Funding",
    faqs: [
      { question: "How do I fund my wallet?", answer: "You can fund your wallet via bank transfer to your unique virtual account number, card payment (Mastercard, Visa, Verve), or USSD. Bank transfers are credited automatically within seconds." },
      { question: "What is a virtual account?", answer: "Your virtual account is a unique bank account number assigned to you for funding your Inkotasub wallet. Any transfer to this account is automatically credited to your wallet instantly." },
      { question: "Is there a minimum funding amount?", answer: "Yes, the minimum funding amount is ₦100. There is no maximum limit for wallet funding." },
      { question: "How long does wallet funding take?", answer: "Bank transfers to your virtual account are usually credited within seconds. Card payments are instant. In rare cases, it may take up to 30 minutes during high traffic periods." },
      { question: "Can I withdraw money from my wallet?", answer: "Currently, wallet withdrawals are not supported. Your wallet balance can only be used for purchasing services on our platform. Please fund only the amount you intend to use." },
    ]
  },
  {
    title: "Transactions",
    faqs: [
      { question: "How do I buy airtime?", answer: "Go to 'Airtime' from the dashboard, enter the recipient's phone number (network is auto-detected), enter the amount, confirm with your PIN, and the airtime will be delivered instantly." },
      { question: "How do I buy data bundles?", answer: "Select 'Data Bundle' from the dashboard, enter the phone number, choose your preferred data plan from the available options, confirm with your PIN, and the data will be credited immediately." },
      { question: "What if I enter the wrong phone number?", answer: "Unfortunately, transactions to wrong numbers cannot be reversed once delivered. Please always double-check the recipient's phone number before confirming any transaction." },
      { question: "Why is my transaction pending?", answer: "Transactions may remain pending due to network delays. Most pending transactions are resolved within 5-30 minutes. If it remains pending after 1 hour, please contact our support team." },
      { question: "How do I check my transaction history?", answer: "Go to 'History' from the dashboard or Settings to view all your past transactions, including status, amount, and date." },
    ]
  },
  {
    title: "Electricity & Bills",
    faqs: [
      { question: "How do I pay for electricity?", answer: "Select 'Electricity' from the dashboard, choose your distribution company (Ikeja Electric, Eko Electric, etc.), enter your meter number, enter the amount, and confirm with your PIN. Your token will be displayed instantly." },
      { question: "What type of meters do you support?", answer: "We support both prepaid and postpaid meters across all major electricity distribution companies in Nigeria." },
      { question: "I didn't receive my electricity token. What should I do?", answer: "If your payment was successful but you didn't receive a token, please check your transaction history for the token number. If not available, contact support with your transaction reference." },
    ]
  },
  {
    title: "Cable TV",
    faqs: [
      { question: "Which cable TV providers do you support?", answer: "We support DSTV, GOtv, and StarTimes subscriptions." },
      { question: "How do I renew my cable TV subscription?", answer: "Select 'Cable TV' from the dashboard, choose your provider, enter your smartcard/IUC number, select a subscription package, and confirm with your PIN." },
      { question: "Can I change my subscription package?", answer: "Yes, you can subscribe to any available package. Your subscription will reflect on your decoder after a few minutes." },
    ]
  },
  {
    title: "Exam Cards",
    faqs: [
      { question: "Which exam cards are available?", answer: "We offer WAEC, NECO, NABTEB, and JAMB result checker PINs and exam registration cards." },
      { question: "How do I purchase an exam card?", answer: "Select 'Exam Cards' from the dashboard, choose the exam type (WAEC, NECO, etc.), select the quantity, confirm with your PIN, and your PINs will be delivered instantly." },
      { question: "What if my exam PIN doesn't work?", answer: "If you receive an invalid PIN, please contact support immediately with a screenshot of the PIN and error message. We will investigate and provide a replacement or refund if confirmed invalid." },
    ]
  },
  {
    title: "Security & Account",
    faqs: [
      { question: "What is a transaction PIN?", answer: "Your transaction PIN is a 4-digit code used to authorize all purchases on Inkotasub. Keep it confidential and never share it with anyone." },
      { question: "What happens if I forget my PIN?", answer: "Go to Settings > Security > Change Transaction PIN. You may need to verify your identity through OTP before resetting your PIN." },
      { question: "What if I enter the wrong PIN multiple times?", answer: "After 5 failed PIN attempts, your account will be temporarily locked for 30 minutes for security purposes. Contact support if you need immediate assistance." },
      { question: "Is my data safe with Inkotasub?", answer: "Yes, we use industry-standard encryption (SSL/TLS) and secure hashing (bcrypt) for all sensitive data. Your information is protected according to our Privacy Policy." },
    ]
  },
  {
    title: "Support & Issues",
    faqs: [
      { question: "How do I contact support?", answer: "You can reach us via Email at inkotasub123@gmail.com, WhatsApp at +234 903 422 6643, or through the in-app Support page." },
      { question: "What are your support hours?", answer: "Our support team is available Monday to Sunday, 8:00 AM to 10:00 PM (WAT). We aim to respond to all inquiries within 24 hours." },
      { question: "How do I report a failed transaction?", answer: "Go to your transaction history, find the failed transaction, and contact support with the transaction reference number. You can also email us directly with the details." },
      { question: "Can I get a refund for failed transactions?", answer: "Yes, failed transactions where payment was deducted are eligible for refunds. Please refer to our Refund Policy for detailed information on eligible scenarios." },
    ]
  },
];

const FAQ = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCategories = searchQuery.trim()
    ? faqCategories.map(cat => ({
        ...cat,
        faqs: cat.faqs.filter(f =>
          f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.answer.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter(cat => cat.faqs.length > 0)
    : faqCategories;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Green Header */}
      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 px-4 pt-4 pb-8">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-lg font-bold text-white">Help & FAQ</h1>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for help..."
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-300"
          />
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-3">
        {filteredCategories.map((category, categoryIndex) => (
          <motion.div
            key={category.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: categoryIndex * 0.05 }}
            className="bg-white rounded-2xl shadow-sm overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">{category.title}</h2>
            </div>
            <Accordion type="single" collapsible className="px-4">
              {category.faqs.map((faq, faqIndex) => (
                <AccordionItem
                  key={faqIndex}
                  value={`${categoryIndex}-${faqIndex}`}
                  className="border-gray-100"
                >
                  <AccordionTrigger className="text-left text-sm font-medium text-gray-800 py-3.5 hover:no-underline [&[data-state=open]]:text-green-600">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-500 text-sm pb-4 leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        ))}

        {filteredCategories.length === 0 && (
          <div className="text-center py-16">
            <Search className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No results for "{searchQuery}"</p>
          </div>
        )}

        {/* Contact Support */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl shadow-sm p-6 text-center"
        >
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-3">
            <MessageCircle className="h-7 w-7 text-white" />
          </div>
          <h3 className="font-bold text-gray-900 mb-1">Still need help?</h3>
          <p className="text-gray-500 text-sm mb-4">Our support team is ready to assist you.</p>
          <button
            onClick={() => navigate("/support")}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold text-sm shadow-lg shadow-green-500/25"
          >
            Contact Support
          </button>
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
};

export default FAQ;
