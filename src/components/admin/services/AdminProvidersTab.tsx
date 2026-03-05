import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings2 className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>VTU Provider Configuration</CardTitle>
                <CardDescription>
                  All services route through SMEPlug as the primary provider
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
                  <TableHead>Provider</TableHead>
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
                      <Badge className="bg-primary/10 text-primary">
                        SMEPlug
                      </Badge>
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
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Provider Information</CardTitle>
              <CardDescription>Current VTU provider details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg bg-muted/50">
            <h4 className="font-medium mb-2">SMEPlug — Sole VTU Provider</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Handles all airtime, data, electricity, cable TV, and exam card purchases</li>
              <li>All transactions are processed directly through SMEPlug API</li>
              <li>Failed transactions result in <strong>no wallet deduction</strong></li>
              <li>All responses are logged for admin review</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminProvidersTab;
