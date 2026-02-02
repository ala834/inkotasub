import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Settings2, Shield } from "lucide-react";
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

const AdminProvidersTab = () => {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

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

  const getServiceLabel = (type: string) => {
    const labels: Record<string, string> = {
      airtime: "Airtime",
      data: "Data",
      electricity: "Electricity",
      cable: "Cable TV",
    };
    return labels[type] || type;
  };

  const getProviderBadgeColor = (provider: string) => {
    return provider === 'subpadi' ? 'bg-blue-500/10 text-blue-600' : 'bg-purple-500/10 text-purple-600';
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings2 className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>VTU Provider Configuration</CardTitle>
                <CardDescription>
                  Manage primary and fallback providers per service and network
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
                  <TableHead>Primary Provider</TableHead>
                  <TableHead>Fallback Provider</TableHead>
                  <TableHead>Fallback Enabled</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {getServiceLabel(config.service_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {config.network ? (
                        <Badge className="bg-muted text-muted-foreground">
                          {config.network}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">All</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={config.primary_provider}
                        onValueChange={(value) => updateConfig(config.id, { primary_provider: value })}
                        disabled={saving === config.id}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="subpadi">
                            <span className={getProviderBadgeColor('subpadi')}>SUBPADI</span>
                          </SelectItem>
                          <SelectItem value="smeplug">
                            <span className={getProviderBadgeColor('smeplug')}>SMEPlug</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={config.fallback_provider || "none"}
                        onValueChange={(value) => updateConfig(config.id, { 
                          fallback_provider: value === "none" ? null : value 
                        })}
                        disabled={saving === config.id}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="subpadi">SUBPADI</SelectItem>
                          <SelectItem value="smeplug">SMEPlug</SelectItem>
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
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-green-600" />
            <div>
              <CardTitle>Provider Failover Logic</CardTitle>
              <CardDescription>How the system handles provider failures</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Automatic Failover Process:</h4>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                <li>System attempts transaction with the <strong>Primary Provider</strong></li>
                <li>If primary fails and <strong>Fallback Enabled</strong> is on, system retries with Fallback Provider</li>
                <li>If both providers fail, transaction is marked as failed and <strong>no wallet deduction</strong> occurs</li>
                <li>All provider responses are logged for admin review</li>
              </ol>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border">
                <h5 className="font-medium text-blue-600 mb-1">SUBPADI</h5>
                <p className="text-muted-foreground text-xs">Primary VTU provider with comprehensive service coverage</p>
              </div>
              <div className="p-4 rounded-lg border">
                <h5 className="font-medium text-purple-600 mb-1">SMEPlug</h5>
                <p className="text-muted-foreground text-xs">Backup provider for failover and redundancy</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminProvidersTab;
