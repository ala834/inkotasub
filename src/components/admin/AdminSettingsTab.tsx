import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, AlertTriangle, Wifi, WifiOff, Loader2 } from "lucide-react";
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
  const [subpadiStatus, setSubpadiStatus] = useState<any>(null);
  const [isTestingSubpadi, setIsTestingSubpadi] = useState(false);

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

  const testSubpadiConnection = async () => {
    setIsTestingSubpadi(true);
    setSubpadiStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-subpadi");
      if (error) throw error;
      setSubpadiStatus(data);
      if (data?.connected) {
        toast.success("Subpadi API connected successfully!");
      } else {
        toast.error(data?.message || "Subpadi connection failed");
      }
    } catch (error) {
      console.error("Subpadi test error:", error);
      setSubpadiStatus({ connected: false, message: "Failed to reach test endpoint" });
      toast.error("Failed to test Subpadi connection");
    } finally {
      setIsTestingSubpadi(false);
    }
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
        {/* API Connection Test Card */}
        <Card className="glass-card border-0 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="h-4 w-4 text-primary" />
              API Provider Status
            </CardTitle>
            <CardDescription>Test connection to VTU service providers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button onClick={testSubpadiConnection} disabled={isTestingSubpadi} variant="outline">
                {isTestingSubpadi ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : subpadiStatus?.connected ? (
                  <Wifi className="h-4 w-4 mr-2 text-green-500" />
                ) : subpadiStatus ? (
                  <WifiOff className="h-4 w-4 mr-2 text-red-500" />
                ) : (
                  <Wifi className="h-4 w-4 mr-2" />
                )}
                Test Subpadi Connection
              </Button>
              {subpadiStatus && (
                <Badge variant={subpadiStatus.connected ? "default" : "destructive"}>
                  {subpadiStatus.connected ? "Connected" : "Disconnected"}
                </Badge>
              )}
            </div>

            {subpadiStatus && (
              <div className={`p-4 rounded-lg space-y-2 text-sm ${subpadiStatus.connected ? 'bg-primary/10 border border-primary/20' : 'bg-destructive/10 border border-destructive/20'}`}>
                <div className="flex items-center gap-2">
                  {subpadiStatus.connected ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-destructive" />
                  )}
                  <p className="font-medium">{subpadiStatus.message}</p>
                </div>
                {!subpadiStatus.connected && (
                  <div className="flex items-center gap-2 text-destructive text-xs mt-1">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Provider is disconnected. Check API key configuration or contact Subpadi support.</span>
                  </div>
                )}
                {subpadiStatus.services && Object.entries(subpadiStatus.services).map(([key, val]: [string, any]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                    <div className="flex items-center gap-2">
                      {val.plan_count !== undefined && (
                        <span className="text-muted-foreground">{val.plan_count} plans</span>
                      )}
                      {val.data?.balance !== undefined && (
                        <span className="text-muted-foreground">₦{Number(val.data.balance).toLocaleString()}</span>
                      )}
                      <Badge variant={val.ok ? "default" : "destructive"} className="text-xs">
                        {val.ok ? `OK (${val.status})` : `Error (${val.status})`}
                      </Badge>
                    </div>
                  </div>
                ))}
                {subpadiStatus.timestamp && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Tested at: {new Date(subpadiStatus.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service Visibility Card */}
        <Card className="glass-card border-0 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="h-4 w-4 text-primary" />
              Service Visibility
            </CardTitle>
            <CardDescription>Enable or disable services on the dashboard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "service_airtime_enabled", label: "Airtime", desc: "Mobile airtime top-up" },
              { key: "service_data_enabled", label: "Data Bundle", desc: "Mobile data plans" },
              { key: "service_electricity_enabled", label: "Electricity", desc: "Electricity bill payment" },
              { key: "service_cable_enabled", label: "Cable TV", desc: "Cable TV subscriptions" },
              { key: "service_exam_pin_enabled", label: "Result Checker", desc: "WAEC, NECO, NABTEB exam PINs" },
            ].map((svc) => (
              <div key={svc.key} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <Label className="text-base font-medium">{svc.label}</Label>
                  <p className="text-sm text-muted-foreground">{svc.desc}</p>
                </div>
                <Switch
                  checked={formData[svc.key] === "true"}
                  onCheckedChange={(checked) => handleChange(svc.key, checked ? "true" : "false")}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* System Controls Card */}
        <Card className="glass-card border-0 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              System Controls
            </CardTitle>
            <CardDescription>Critical system settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <Label className="text-base font-medium">Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Temporarily disable user access to the app
                </p>
              </div>
              <Switch
                checked={formData.maintenance_mode === "true"}
                onCheckedChange={(checked) => handleChange("maintenance_mode", checked ? "true" : "false")}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <Label className="text-base font-medium">Disable Registration</Label>
                <p className="text-sm text-muted-foreground">
                  Stop new users from signing up
                </p>
              </div>
              <Switch
                checked={formData.disable_registration === "true"}
                onCheckedChange={(checked) => handleChange("disable_registration", checked ? "true" : "false")}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Wallet Funding (₦)</Label>
                <Input
                  type="number"
                  value={formData.min_wallet_funding || ""}
                  onChange={(e) => handleChange("min_wallet_funding", e.target.value)}
                  placeholder="100"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Wallet Funding (₦)</Label>
                <Input
                  type="number"
                  value={formData.max_wallet_funding || ""}
                  onChange={(e) => handleChange("max_wallet_funding", e.target.value)}
                  placeholder="1000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Min Transfer Amount (₦)</Label>
                <Input
                  type="number"
                  value={formData.min_transfer_amount || ""}
                  onChange={(e) => handleChange("min_transfer_amount", e.target.value)}
                  placeholder="100"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Transfer Amount (₦)</Label>
                <Input
                  type="number"
                  value={formData.max_transfer_amount || ""}
                  onChange={(e) => handleChange("max_transfer_amount", e.target.value)}
                  placeholder="500000"
                />
              </div>
            </div>
          </CardContent>
        </Card>

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
              <Label htmlFor="whatsapp_number">WhatsApp Number</Label>
              <Input
                id="whatsapp_number"
                value={formData.whatsapp_number || ""}
                onChange={(e) => handleChange("whatsapp_number", e.target.value)}
                placeholder="+2349034226643"
              />
              <p className="text-xs text-muted-foreground">Used for wa.me links</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="support_email">Support Email</Label>
              <Input
                id="support_email"
                type="email"
                value={formData.support_email || ""}
                onChange={(e) => handleChange("support_email", e.target.value)}
                placeholder="inkotasub123@gmail.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support_phone">Support Phone (Call)</Label>
              <Input
                id="support_phone"
                value={formData.support_phone || ""}
                onChange={(e) => handleChange("support_phone", e.target.value)}
                placeholder="+2349034226643"
              />
              <p className="text-xs text-muted-foreground">Used for tel: links</p>
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
