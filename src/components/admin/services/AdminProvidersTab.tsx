import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Settings2, Shield, Wifi, WifiOff, CheckCircle2, XCircle } from "lucide-react";
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
  message: string;
  checking: boolean;
}

const PROVIDERS = ["subpadi"];

const AdminProvidersTab = () => {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<Record<string, ProviderStatus>>({
    subpadi: { name: "Subpadi", connected: false, message: "Not checked", checking: false },
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
      console.error(error);
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
      console.error(error);
    } else {
      toast.success("Configuration updated");
      setConfigs(configs.map(c => c.id === id ? { ...c, ...updates } : c));
    }
    setSaving(null);
  };

  const testProvider = async (provider: string) => {
    setProviderStatuses(prev => ({
      ...prev,
      [provider]: { ...prev[provider], checking: true },
    }));

    try {
      if (provider === "subpadi") {
        const { data, error } = await supabase.functions.invoke("test-subpadi");
        if (error) throw error;
        setProviderStatuses(prev => ({
          ...prev,
          subpadi: {
            ...prev.subpadi,
            connected: data?.connected ?? false,
            message: data?.message || "Unknown",
            checking: false,
          },
        }));
      }
    } catch {
      setProviderStatuses(prev => ({
        ...prev,
        [provider]: { ...prev[provider], connected: false, message: "Test failed", checking: false },
      }));
    }
  };

  const getServiceLabel = (type: string) => {
    const labels: Record<string, string> = {
      airtime: "Airtime",
      data: "Data",
      electricity: "Electricity",
      cable: "Cable TV",
      exam_pin: "Exam Cards",
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
                <CardDescription>Connection status for all configured VTU providers</CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { testProvider("subpadi"); }}
            >
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
                      <span className="font-medium capitalize">{s.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.message}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => testProvider(key)}
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
                            <SelectItem key={p} value={p} className="capitalize">{p === "subpadi" ? "Subpadi" : p}</SelectItem>
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
                            <SelectItem key={p} value={p} className="capitalize">{p === "subpadi" ? "Subpadi" : p}</SelectItem>
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
            <h4 className="font-medium">Subpadi — Primary VTU Provider</h4>
            <ul className="list-disc list-inside space-y-0.5 text-sm text-muted-foreground">
              <li>Base URL: https://subpadi.com/api/</li>
              <li>Supports airtime, data, cable TV, electricity, exam cards</li>
              <li>10-second timeout with automatic retry</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminProvidersTab;
