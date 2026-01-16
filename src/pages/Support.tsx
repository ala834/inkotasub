import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Mail, Phone, ExternalLink, Headphones } from "lucide-react";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface SupportSettings {
  whatsapp_number: string;
  support_email: string;
  support_phone: string;
}

const Support = () => {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<SupportSettings>({
    whatsapp_number: "+2349034226643",
    support_email: "inkotasub123@gmail.com",
    support_phone: "+2349034226643",
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["whatsapp_number", "support_email", "support_phone"]);

      if (!error && data) {
        const settingsMap: Partial<SupportSettings> = {};
        data.forEach((s) => {
          if (s.value) {
            settingsMap[s.key as keyof SupportSettings] = s.value;
          }
        });
        setSettings((prev) => ({ ...prev, ...settingsMap }));
      }
    } catch (error) {
      console.error("Failed to fetch support settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatWhatsAppNumber = (number: string) => {
    return number.replace(/[^0-9]/g, "");
  };

  const notifyAdmins = async (contactMethod: "whatsapp" | "email" | "call") => {
    try {
      await supabase.functions.invoke("notify-admin-support", {
        body: {
          contact_method: contactMethod,
          user_email: user?.email,
          user_name: profile?.full_name,
        },
      });
    } catch (error) {
      console.error("Failed to notify admins:", error);
    }
  };

  const handleWhatsApp = () => {
    notifyAdmins("whatsapp");
    const formattedNumber = formatWhatsAppNumber(settings.whatsapp_number);
    window.open(`https://wa.me/${formattedNumber}`, "_blank");
  };

  const handleEmail = () => {
    notifyAdmins("email");
    window.location.href = `mailto:${settings.support_email}`;
  };

  const handleCall = () => {
    notifyAdmins("call");
    window.location.href = `tel:${settings.support_phone}`;
  };

  const contactMethods = [
    {
      icon: MessageCircle,
      title: "WhatsApp",
      description: "Chat with us instantly on WhatsApp",
      value: settings.whatsapp_number,
      action: handleWhatsApp,
      color: "bg-green-500",
      hoverColor: "hover:bg-green-600",
      iconBg: "bg-green-500/10",
      iconColor: "text-green-500",
    },
    {
      icon: Mail,
      title: "Email Support",
      description: "Send us an email for detailed inquiries",
      value: settings.support_email,
      action: handleEmail,
      color: "bg-blue-500",
      hoverColor: "hover:bg-blue-600",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
    {
      icon: Phone,
      title: "Call Us",
      description: "Speak directly with our support team",
      value: settings.support_phone,
      action: handleCall,
      color: "bg-primary",
      hoverColor: "hover:bg-primary/90",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
  ];

  return (
    <div className="min-h-screen gradient-hero pb-24">
      <Header />

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
              <Headphones className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">Help & Support</h1>
            <p className="text-muted-foreground">
              We're here to help! Reach out through any of the channels below.
            </p>
          </div>

          {/* Contact Methods */}
          <div className="space-y-4">
            {contactMethods.map((method, index) => (
              <motion.div
                key={method.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="glass-card border-0 overflow-hidden">
                  <CardContent className="p-0">
                    <button
                      onClick={method.action}
                      className="w-full flex items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                    >
                      <div className={`w-12 h-12 rounded-xl ${method.iconBg} flex items-center justify-center flex-shrink-0`}>
                        <method.icon className={`h-6 w-6 ${method.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">{method.title}</h3>
                        <p className="text-sm text-muted-foreground truncate">{method.description}</p>
                        <p className="text-sm font-medium text-primary mt-1">{method.value}</p>
                      </div>
                      <ExternalLink className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3 pt-4">
            <Button
              onClick={handleWhatsApp}
              className="h-14 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold"
            >
              <MessageCircle className="h-5 w-5 mr-2" />
              WhatsApp
            </Button>
            <Button
              onClick={handleCall}
              className="h-14 rounded-xl gradient-primary text-primary-foreground font-semibold"
            >
              <Phone className="h-5 w-5 mr-2" />
              Call Now
            </Button>
          </div>

          {/* Support Hours Card */}
          <Card className="glass-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Support Hours</CardTitle>
              <CardDescription>When you can reach us</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monday - Friday</span>
                <span className="font-medium">8:00 AM - 10:00 PM</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Saturday</span>
                <span className="font-medium">9:00 AM - 8:00 PM</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sunday</span>
                <span className="font-medium">10:00 AM - 6:00 PM</span>
              </div>
            </CardContent>
          </Card>

          {/* FAQ Preview */}
          <Card className="glass-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Frequently Asked Questions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <p className="font-medium text-sm">How long do transactions take?</p>
                <p className="text-sm text-muted-foreground">
                  Most transactions are processed instantly. If there's a delay, please contact support.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">How do I get a refund?</p>
                <p className="text-sm text-muted-foreground">
                  Failed transactions are automatically refunded within 24 hours. Contact support for other issues.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">How do I become an agent?</p>
                <p className="text-sm text-muted-foreground">
                  Contact our support team via WhatsApp to learn about our agent program and benefits.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Support;
