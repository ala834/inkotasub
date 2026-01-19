import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Edit2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface PricingConfig {
  id: string;
  network: string | null;
  profit_type: string;
  profit_value: number;
  user_type: string;
  is_active: boolean;
}

const NETWORKS = [
  { id: "MTN", name: "MTN Nigeria", color: "bg-yellow-500" },
  { id: "AIRTEL", name: "Airtel Nigeria", color: "bg-red-500" },
  { id: "GLO", name: "Glo Nigeria", color: "bg-green-500" },
  { id: "9MOBILE", name: "9Mobile Nigeria", color: "bg-emerald-600" },
];

const AdminAirtimePricingTab = () => {
  const { user } = useAuth();
  const [pricingConfigs, setPricingConfigs] = useState<PricingConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNetwork, setEditingNetwork] = useState<string | null>(null);
  const [profitData, setProfitData] = useState({
    profit_type: "percentage",
    profit_value: "",
    user_type: "user",
  });

  useEffect(() => {
    fetchPricingConfigs();
  }, []);

  const fetchPricingConfigs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "airtime");

    if (!error && data) {
      setPricingConfigs(data.map(c => ({
        ...c,
        profit_value: parseFloat(c.profit_value as unknown as string),
      })));
    }
    setIsLoading(false);
  };

  const getConfigForNetwork = (networkId: string, userType: string = "user") => {
    return pricingConfigs.find(
      c => c.network === networkId && c.user_type === userType
    ) || pricingConfigs.find(
      c => !c.network && c.user_type === userType
    );
  };

  const handleSetProfit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNetwork) return;

    try {
      const existingConfig = pricingConfigs.find(
        c => c.network === editingNetwork && c.user_type === profitData.user_type
      );

      const configData = {
        service_type: "airtime",
        network: editingNetwork,
        plan_id: null,
        profit_type: profitData.profit_type,
        profit_value: parseFloat(profitData.profit_value),
        user_type: profitData.user_type,
        is_active: true,
      };

      if (existingConfig) {
        const { error } = await supabase
          .from("pricing_config")
          .update(configData)
          .eq("id", existingConfig.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("pricing_config")
          .insert(configData);

        if (error) throw error;
      }

      // Log the change
      await supabase.from("price_change_log").insert({
        admin_id: user?.id,
        pricing_config_id: existingConfig?.id || null,
        change_type: "profit_updated",
        old_value: existingConfig ? { profit_type: existingConfig.profit_type, profit_value: existingConfig.profit_value } : null,
        new_value: { profit_type: profitData.profit_type, profit_value: parseFloat(profitData.profit_value), network: editingNetwork },
      });

      toast.success("Airtime profit updated");
      setIsDialogOpen(false);
      setEditingNetwork(null);
      fetchPricingConfigs();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to update profit");
    }
  };

  const handleToggleActive = async (config: PricingConfig) => {
    const { error } = await supabase
      .from("pricing_config")
      .update({ is_active: !config.is_active })
      .eq("id", config.id);

    if (error) {
      toast.error("Failed to update status");
    } else {
      fetchPricingConfigs();
    }
  };

  const openEditDialog = (networkId: string) => {
    const existingConfig = getConfigForNetwork(networkId, "user");
    setEditingNetwork(networkId);
    setProfitData({
      profit_type: existingConfig?.profit_type || "percentage",
      profit_value: existingConfig?.profit_value?.toString() || "",
      user_type: "user",
    });
    setIsDialogOpen(true);
  };

  const formatProfit = (config: PricingConfig | undefined) => {
    if (!config) return "Not set";
    return config.profit_type === "percentage" 
      ? `${config.profit_value}%` 
      : `₦${config.profit_value.toLocaleString()}`;
  };

  const calculateExamplePrice = (amount: number, config: PricingConfig | undefined) => {
    if (!config) return amount;
    if (config.profit_type === "percentage") {
      return Math.round(amount * (1 + config.profit_value / 100));
    }
    return amount + config.profit_value;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Airtime Pricing</h3>
          <p className="text-sm text-muted-foreground">
            Set profit margins for airtime purchases per network
          </p>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Set Profit for {NETWORKS.find(n => n.id === editingNetwork)?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSetProfit} className="space-y-4">
            <div className="space-y-2">
              <Label>User Type</Label>
              <Select value={profitData.user_type} onValueChange={(v) => setProfitData(prev => ({ ...prev, user_type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Regular User</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Profit Type</Label>
                <Select value={profitData.profit_type} onValueChange={(v) => setProfitData(prev => ({ ...prev, profit_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (₦)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Profit Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={profitData.profit_value}
                  onChange={(e) => setProfitData(prev => ({ ...prev, profit_value: e.target.value }))}
                  placeholder={profitData.profit_type === "percentage" ? "3" : "50"}
                  required
                />
              </div>
            </div>
            {profitData.profit_value && (
              <div className="p-3 bg-primary/10 rounded-lg text-sm">
                <p className="font-medium">Example: ₦1,000 airtime</p>
                <p className="text-lg font-bold">
                  User pays: ₦{(profitData.profit_type === "percentage"
                    ? Math.round(1000 * (1 + parseFloat(profitData.profit_value || "0") / 100))
                    : 1000 + parseFloat(profitData.profit_value || "0")
                  ).toLocaleString()}
                </p>
              </div>
            )}
            <Button type="submit" className="w-full">Save Profit Margin</Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Network</TableHead>
              <TableHead>User Profit</TableHead>
              <TableHead>Agent Profit</TableHead>
              <TableHead>Example (₦1,000)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">Loading...</TableCell>
              </TableRow>
            ) : (
              NETWORKS.map((network) => {
                const userConfig = getConfigForNetwork(network.id, "user");
                const agentConfig = getConfigForNetwork(network.id, "agent");
                
                return (
                  <TableRow key={network.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${network.color}`} />
                        <span className="font-medium">{network.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={userConfig ? "default" : "secondary"}>
                        {formatProfit(userConfig)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={agentConfig ? "outline" : "secondary"}>
                        {formatProfit(agentConfig)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      ₦{calculateExamplePrice(1000, userConfig).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {userConfig ? (
                        <Switch
                          checked={userConfig.is_active}
                          onCheckedChange={() => handleToggleActive(userConfig)}
                        />
                      ) : (
                        <Badge variant="secondary">Not configured</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(network.id)}
                        className="gap-1"
                      >
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="glass-card rounded-xl p-4 space-y-2">
        <h4 className="font-medium text-sm">Airtime Pricing Notes</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Airtime is typically sold at face value from SUBPADI</li>
          <li>• Profit is added on top of the airtime amount</li>
          <li>• Agents typically get lower profit margins (discounts)</li>
          <li>• Percentage profit is recommended for airtime</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminAirtimePricingTab;
