import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";

interface AppSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
}

const AdminSettingsTab = () => {
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("app_settings")
      .select("*")
      .order("key");

    if (!error && data) {
      setSettings(data);
      const initialData: Record<string, string> = {};
      data.forEach((s) => {
        initialData[s.key] = s.value || "";
      });
      setFormData(initialData);
    }
    setIsLoading(false);
  };

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates = Object.entries(formData).map(([key, value]) =>
        supabase.from("app_settings").update({ value }).eq("key", key)
      );

      await Promise.all(updates);
      toast.success("Settings saved successfully");
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const settingLabels: Record<string, { label: string; type: "text" | "textarea" | "url" | "email" }> = {
    app_name: { label: "Application Name", type: "text" },
    support_email: { label: "Support Email", type: "email" },
    support_phone: { label: "Support Phone", type: "text" },
    logo_url: { label: "Logo URL", type: "url" },
    terms_url: { label: "Terms of Service URL", type: "url" },
    privacy_url: { label: "Privacy Policy URL", type: "url" },
    refund_policy: { label: "Refund Policy", type: "textarea" },
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Application Settings</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchSettings} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Branding Card */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
            <CardDescription>Configure your app's identity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="app_name">Application Name</Label>
              <Input
                id="app_name"
                value={formData.app_name || ""}
                onChange={(e) => handleChange("app_name", e.target.value)}
                placeholder="Your app name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo_url">Logo URL</Label>
              <div className="flex gap-2">
                <Input
                  id="logo_url"
                  type="url"
                  value={formData.logo_url || ""}
                  onChange={(e) => handleChange("logo_url", e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              {formData.logo_url && (
                <div className="mt-2 p-4 bg-muted rounded-lg flex items-center justify-center">
                  <img
                    src={formData.logo_url}
                    alt="Logo preview"
                    className="max-h-16 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Support Card */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-base">Support Information</CardTitle>
            <CardDescription>Contact details for user support</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="support_email">Support Email</Label>
              <Input
                id="support_email"
                type="email"
                value={formData.support_email || ""}
                onChange={(e) => handleChange("support_email", e.target.value)}
                placeholder="support@yourapp.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support_phone">Support Phone</Label>
              <Input
                id="support_phone"
                value={formData.support_phone || ""}
                onChange={(e) => handleChange("support_phone", e.target.value)}
                placeholder="+234 XXX XXX XXXX"
              />
            </div>
          </CardContent>
        </Card>

        {/* Legal Card */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-base">Legal Pages</CardTitle>
            <CardDescription>Links to your legal documents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="terms_url">Terms of Service URL</Label>
              <Input
                id="terms_url"
                type="url"
                value={formData.terms_url || ""}
                onChange={(e) => handleChange("terms_url", e.target.value)}
                placeholder="https://yourapp.com/terms"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="privacy_url">Privacy Policy URL</Label>
              <Input
                id="privacy_url"
                type="url"
                value={formData.privacy_url || ""}
                onChange={(e) => handleChange("privacy_url", e.target.value)}
                placeholder="https://yourapp.com/privacy"
              />
            </div>
          </CardContent>
        </Card>

        {/* Policies Card */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-base">Policies</CardTitle>
            <CardDescription>In-app policy content</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="refund_policy">Refund Policy</Label>
              <Textarea
                id="refund_policy"
                value={formData.refund_policy || ""}
                onChange={(e) => handleChange("refund_policy", e.target.value)}
                placeholder="Enter your refund policy..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminSettingsTab;
