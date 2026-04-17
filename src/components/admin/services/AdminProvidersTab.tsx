import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Settings2, Shield, Wifi, CheckCircle2, XCircle, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProviderConfig {
  id: string;
  service_type: string;
  network: string | null;
  primary_provider: string;
  fallback_provider: string | null;
  fallback_enabled: boolean;
  is_active: boolean;
}

interface ProviderStatus {
  name: string;
  connected: boolean;
  balance: string | null;
  message: string;
  checking: boolean;
  latency?: number | null;
}

const PROVIDERS = ["subpadi", "smeplug", "clubkonnect", "render"];

const AdminProvidersTab = () => {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<Record<string, ProviderStatus>>({
    subpadi: { name: "Subpadi", connected: false, balance: null, message: "Not checked", checking: false },
    smeplug: { name: "SMEPlug", connected: false, balance: null, message: "Not checked", checking: false },
    clubkonnect: { name: "ClubKonnect", connected: false, balance: null, message: "Not checked", checking: false },
    render: { name: "Render Backend", connected: false, balance: null, message: "Not checked", checking: false },
  });

  const fetchConfigs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("provider_config")
      .select("*")
      .order("service_type")
      .order("network");

    if (error) {
      toast.error("Failed to load provider configurations");
    } else {
      setConfigs(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const updateConfig = async (id: string, updates: Partial<ProviderConfig>) => {
    setSaving(id);
    const { error } = await supabase
      .from("provider_config")
      .update(updates)
      .eq("id", id);

    if (error) {
      toast.error("Failed to update configuration");
    } else {
      toast.success("Configuration updated");
      setConfigs(configs.map(c => c.id === id ? { ...c, ...updates } : c));
    }
    setSaving(null);
  };

  const testAllProviders = async () => {
    setProviderStatuses(prev => {
      const updated = { ...prev };
      for (const key of PROVIDERS) {
        updated[key] = { ...updated[key], checking: true };
      }
      return updated;
    });

    try {
      const { data, error } = await supabase.functions.invoke("check-provider-balance");
      if (error) throw error;

      const providers = data?.providers || {};
      setProviderStatuses(prev => {
        const updated = { ...prev };
        for (const key of PROVIDERS) {
          const p = providers[key];
          if (p) {
            const isRender = key === "render";
            const latency = isRender ? (p.details?.latency_ms ?? null) : null;
            updated[key] = {
              ...updated[key],
              connected: p.connected,
              balance: p.balance != null ? `₦${Number(p.balance).toLocaleString()}` : null,
              latency,
              message: p.configured
                ? (p.connected
                    ? (isRender
                        ? `Online${latency != null ? ` · ${latency}ms` : ""}`
                        : "Connected")
                    : (isRender ? "Offline / unreachable" : "Connection failed"))
                : "Not configured",
              checking: false,
            };
          } else {
            updated[key] = { ...updated[key], message: "Not configured", checking: false };
          }
        }
        return updated;
      });
    } catch {
      setProviderStatuses(prev => {
        const updated = { ...prev };
        for (const key of PROVIDERS) {
          updated[key] = { ...updated[key], message: "Test failed", checking: false };
        }
        return updated;
      });
    }
  };

  const getServiceLabel = (type: string) => {
    const labels: Record<string, string> = {
      airtime: "Airtime", data: "Data", electricity: "Electricity",
      cable: "Cable TV", exam_pin: "Exam Cards",
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Provider Connection Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>API Providers</CardTitle>
                <CardDescription>Connection status and wallet balance for all VTU providers</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={testAllProviders}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Test All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            {PROVIDERS.map((key) => {
              const s = providerStatuses[key];
              return (
                <div
                  key={key}
                  className={`p-4 rounded-lg border flex items-start justify-between gap-3 ${
                    s.connected
                      ? "bg-primary/5 border-primary/20"
                      : s.message === "Not checked"
                        ? "bg-muted/50 border-border"
                        : "bg-destructive/5 border-destructive/20"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {s.checking ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : s.connected ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : s.message === "Not checked" ? (
                        <Wifi className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="font-medium">{s.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.message}</p>
                    {s.balance && (
                      <div className="flex items-center gap-1 text-sm font-medium text-primary">
                        <DollarSign className="h-3 w-3" />
                        {s.balance}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={testAllProviders}
                    disabled={s.checking}
                  >
                    {s.checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Service-Level Provider Mapping */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings2 className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Service Provider Mapping</CardTitle>
                <CardDescription>
                  Set primary and fallback providers per service. Changes are saved immediately.
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchConfigs}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Primary</TableHead>
                  <TableHead>Fallback</TableHead>
                  <TableHead>Fallback On</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id} className={!config.is_active ? "opacity-50" : ""}>
                    <TableCell>
                      <Badge variant="outline">{getServiceLabel(config.service_type)}</Badge>
                    </TableCell>
                    <TableCell>
                      {config.network ? (
                        <Badge className="bg-muted text-muted-foreground">{config.network}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">All</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={config.primary_provider}
                        onValueChange={(val) => updateConfig(config.id, { primary_provider: val })}
                        disabled={saving === config.id}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROVIDERS.map((p) => (
                            <SelectItem key={p} value={p} className="capitalize">
                              {p === "subpadi" ? "Subpadi" : p === "smeplug" ? "SMEPlug" : p === "clubkonnect" ? "ClubKonnect" : p === "render" ? "Render Backend" : p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={config.fallback_provider || "none"}
                        onValueChange={(val) =>
                          updateConfig(config.id, { fallback_provider: val === "none" ? null : val })
                        }
                        disabled={saving === config.id}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {PROVIDERS.filter((p) => p !== config.primary_provider).map((p) => (
                            <SelectItem key={p} value={p} className="capitalize">
                              {p === "subpadi" ? "Subpadi" : p === "smeplug" ? "SMEPlug" : p === "clubkonnect" ? "ClubKonnect" : p === "render" ? "Render Backend" : p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={config.fallback_enabled}
                        onCheckedChange={(checked) => updateConfig(config.id, { fallback_enabled: checked })}
                        disabled={saving === config.id || !config.fallback_provider}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={config.is_active}
                        onCheckedChange={(checked) => updateConfig(config.id, { is_active: checked })}
                        disabled={saving === config.id}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {configs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No provider configurations found. Add service entries to the database.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Provider Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Provider Details</CardTitle>
              <CardDescription>Configured VTU API providers</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 space-y-1">
            <h4 className="font-medium">Subpadi</h4>
            <ul className="list-disc list-inside space-y-0.5 text-sm text-muted-foreground">
              <li>Base URL: https://subpadi.com/api/</li>
              <li>Supports airtime, data, cable TV, electricity, exam cards</li>
              <li>10-second timeout with automatic retry (2 retries)</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 space-y-1">
            <h4 className="font-medium">SMEPlug</h4>
            <ul className="list-disc list-inside space-y-0.5 text-sm text-muted-foreground">
              <li>Base URL: https://smeplug.ng/api/v1/</li>
              <li>Supports airtime, data</li>
              <li>15-second timeout with automatic retry (2 retries)</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 space-y-1">
            <h4 className="font-medium">ClubKonnect</h4>
            <ul className="list-disc list-inside space-y-0.5 text-sm text-muted-foreground">
              <li>Base URL: https://www.clubkonnect.com/</li>
              <li>Supports airtime, data, recharge card printing (EPIN)</li>
              <li>HTTPS GET API with UserID + APIKey authentication</li>
              <li>15-second timeout with automatic retry (2 retries)</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 space-y-1">
            <h4 className="font-medium">Render Backend</h4>
            <ul className="list-disc list-inside space-y-0.5 text-sm text-muted-foreground">
              <li>Base URL: https://inkotasub-backend.onrender.com</li>
              <li>Supports airtime (/buy-airtime), data (/buy-data)</li>
              <li>15-second timeout, no API key required</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminProvidersTab;
