import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Mail, Phone, ChevronRight, Headphones, Clock, HelpCircle, ArrowLeft, Copy, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SupportChatWidget from "@/components/support/SupportChatWidget";
import BottomNav from "@/components/layout/BottomNav";
import { toast } from "sonner";

interface SupportSettings {
  whatsapp_number: string;
  support_email: string;
  support_phone: string;
}

const Support = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<SupportSettings>({
    whatsapp_number: "+2349034226643",
    support_email: "inkotasub123@gmail.com",
    support_phone: "+2349034226643",
  });
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("app_settings")
          .select("key, value")
          .in("key", ["whatsapp_number", "support_email", "support_phone"]);
        if (!error && data) {
          const map: Partial<SupportSettings> = {};
          data.forEach((s) => {
            if (s.value) map[s.key as keyof SupportSettings] = s.value;
          });
          setSettings((prev) => ({ ...prev, ...map }));
        }
      } catch (e) {
        console.error("Failed to fetch support settings:", e);
      }
    };
    fetchSettings();
  }, []);

  const notifyAdmins = async (method: "whatsapp" | "email" | "call") => {
    try {
      await supabase.functions.invoke("notify-admin-support", {
        body: { contact_method: method, user_email: user?.email, user_name: profile?.full_name },
      });
    } catch (e) {
      console.error("Failed to notify admins:", e);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleWhatsApp = () => {
    notifyAdmins("whatsapp");
    window.open(`https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}`, "_blank");
  };

  const handleEmail = () => {
    notifyAdmins("email");
    window.location.href = `mailto:${settings.support_email}`;
  };

  const handleCall = () => {
    notifyAdmins("call");
    window.location.href = `tel:${settings.support_phone}`;
  };

  const faqs = [
    { q: "How long do transactions take?", a: "Most transactions are processed instantly. If there's a delay, please contact support." },
    { q: "How do I get a refund?", a: "Failed transactions are automatically refunded within 24 hours." },
    { q: "How do I become an agent?", a: "Contact our support team via WhatsApp to learn about our agent program." },
  ];

  const supportHours = [
    { day: "Monday - Friday", time: "8:00 AM - 10:00 PM" },
    { day: "Saturday", time: "9:00 AM - 8:00 PM" },
    { day: "Sunday", time: "10:00 AM - 6:00 PM" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-600 to-emerald-500 px-4 pt-12 pb-16 relative overflow-hidden">
        <div className="absolute top-6 right-6 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full blur-xl" />
        <div className="relative z-10">
          <button onClick={() => navigate(-1)} className="mb-4 p-2 -ml-2 text-white/80 active:bg-white/10 rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <Headphones className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Help & Support</h1>
              <p className="text-white/70 text-sm">We're here to help 24/7</p>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 -mt-8 relative z-10 max-w-lg mx-auto space-y-4">
        {/* Contact Methods */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Contact Us</h2>
          </div>

          {/* WhatsApp */}
          <button onClick={handleWhatsApp} className="w-full flex items-center gap-3 p-4 border-b border-gray-50 active:bg-gray-50 transition-colors">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-900 text-sm">WhatsApp</p>
              <p className="text-xs text-gray-500">{settings.whatsapp_number}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>

          {/* Email */}
          <button onClick={handleEmail} className="w-full flex items-center gap-3 p-4 border-b border-gray-50 active:bg-gray-50 transition-colors">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-medium text-gray-900 text-sm">Email Support</p>
              <p className="text-xs text-gray-500 truncate">{settings.support_email}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); copyToClipboard(settings.support_email, "email"); }}
              className="p-1.5 rounded-lg active:bg-gray-100"
            >
              {copiedField === "email" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-400" />}
            </button>
          </button>

          {/* Phone */}
          <button onClick={handleCall} className="w-full flex items-center gap-3 p-4 active:bg-gray-50 transition-colors">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Phone className="h-5 w-5 text-orange-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-900 text-sm">Call Us</p>
              <p className="text-xs text-gray-500">{settings.support_phone}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>
        </motion.div>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 gap-3">
          <button onClick={handleWhatsApp} className="bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-2xl p-4 flex flex-col items-center gap-2 shadow-lg shadow-green-500/20 active:scale-[0.98] transition-transform">
            <MessageCircle className="h-6 w-6" />
            <span className="text-sm font-semibold">Chat on WhatsApp</span>
          </button>
          <button onClick={handleCall} className="bg-white text-gray-900 rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform">
            <Phone className="h-6 w-6 text-green-600" />
            <span className="text-sm font-semibold">Call Now</span>
          </button>
        </motion.div>

        {/* Support Hours */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-green-600" />
            <h2 className="font-semibold text-gray-900 text-sm">Support Hours</h2>
          </div>
          <div className="space-y-2">
            {supportHours.map((h) => (
              <div key={h.day} className="flex justify-between text-sm">
                <span className="text-gray-500">{h.day}</span>
                <span className="font-medium text-gray-900">{h.time}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-green-600" />
            <h2 className="font-semibold text-gray-900 text-sm">Quick FAQ</h2>
          </div>
          {faqs.map((faq, i) => (
            <div key={i} className={`p-4 ${i < faqs.length - 1 ? "border-b border-gray-50" : ""}`}>
              <p className="font-medium text-gray-900 text-sm">{faq.q}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{faq.a}</p>
            </div>
          ))}
          <button onClick={() => navigate("/faq")} className="w-full p-3 text-center text-sm font-medium text-green-600 border-t border-gray-100 active:bg-gray-50">
            View All FAQs
          </button>
        </motion.div>
      </main>

      <SupportChatWidget />
      <BottomNav />
    </div>
  );
};

export default Support;
