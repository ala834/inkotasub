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
import { Edit2, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface PricingConfig {
  id: string;
  network: string | null;
  profit_type: string;
  profit_value: number;
  user_type: string;
  is_active: boolean;
}

const DISCOS = [
  { id: "EKEDC", name: "Eko Electricity (EKEDC)", region: "Lagos" },
  { id: "IKEDC", name: "Ikeja Electricity (IKEDC)", region: "Lagos" },
  { id: "AEDC", name: "Abuja Electricity (AEDC)", region: "Abuja" },
  { id: "PHED", name: "Port Harcourt Electricity (PHED)", region: "Port Harcourt" },
  { id: "KEDCO", name: "Kano Electricity (KEDCO)", region: "Kano" },
  { id: "KAEDCO", name: "Kaduna Electricity (KAEDCO)", region: "Kaduna" },
  { id: "JED", name: "Jos Electricity (JED)", region: "Jos" },
  { id: "IBEDC", name: "Ibadan Electricity (IBEDC)", region: "Ibadan" },
  { id: "BEDC", name: "Benin Electricity (BEDC)", region: "Benin" },
  { id: "EEDC", name: "Enugu Electricity (EEDC)", region: "Enugu" },
  { id: "YEDC", name: "Yola Electricity (YEDC)", region: "Yola" },
];

const AdminElectricityTab = () => {
  const { user } = useAuth();
  const [pricingConfigs, setPricingConfigs] = useState<PricingConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDisco, setEditingDisco] = useState<string | null>(null);
  const [profitData, setProfitData] = useState({
    profit_type: "fixed",
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
      .eq("service_type", "electricity");

    if (!error && data) {
      setPricingConfigs(data.map(c => ({
        ...c,
        profit_value: parseFloat(c.profit_value as unknown as string),
      })));
    }
    setIsLoading(false);
  };

  const getConfigForDisco = (discoId: string, userType: string = "user") => {
    return pricingConfigs.find(
      c => c.network === discoId && c.user_type === userType
    ) || pricingConfigs.find(
      c => !c.network && c.user_type === userType
    );
  };

  const handleSetProfit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDisco) return;

    try {
      const existingConfig = pricingConfigs.find(
        c => c.network === editingDisco && c.user_type === profitData.user_type
      );

      const configData = {
        service_type: "electricity",
        network: editingDisco,
        plan_id: null,
        profit_type: profitData.profit_type,
        profit_value: parseFloat(profitData.profit_value),
        user_type: profitData.user_type,
        is_active: true,
      };

      if (existingConfig) {
        await supabase.from("pricing_config").update(configData).eq("id", existingConfig.id);
      } else {
        await supabase.from("pricing_config").insert(configData);
      }

      await supabase.from("price_change_log").insert({
        admin_id: user?.id,
        pricing_config_id: existingConfig?.id || null,
        change_type: "profit_updated",
        old_value: existingConfig ? { profit_value: existingConfig.profit_value } : null,
        new_value: { profit_type: profitData.profit_type, profit_value: parseFloat(profitData.profit_value), disco: editingDisco },
      });

      toast.success("Electricity profit updated");
      setIsDialogOpen(false);
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

  const openEditDialog = (discoId: string) => {
    const existingConfig = getConfigForDisco(discoId, "user");
    setEditingDisco(discoId);
    setProfitData({
      profit_type: existingConfig?.profit_type || "fixed",
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
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-yellow-500" />
        <div>
          <h3 className="font-semibold text-lg">Electricity Pricing</h3>
          <p className="text-sm text-muted-foreground">
            Set profit margins for electricity bill payments per distribution company
          </p>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Set Profit for {DISCOS.find(d => d.id === editingDisco)?.name}
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
                    <SelectItem value="fixed">Fixed Amount (₦)</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
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
                  placeholder={profitData.profit_type === "fixed" ? "100" : "1"}
                  required
                />
              </div>
            </div>
            {profitData.profit_value && (
              <div className="p-3 bg-primary/10 rounded-lg text-sm">
                <p className="font-medium">Example: ₦5,000 electricity</p>
                <p className="text-lg font-bold">
                  User pays: ₦{(profitData.profit_type === "percentage"
                    ? Math.round(5000 * (1 + parseFloat(profitData.profit_value || "0") / 100))
                    : 5000 + parseFloat(profitData.profit_value || "0")
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
              <TableHead>Distribution Company</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>User Profit</TableHead>
              <TableHead>Agent Profit</TableHead>
              <TableHead>Example (₦5,000)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">Loading...</TableCell>
              </TableRow>
            ) : (
              DISCOS.map((disco) => {
                const userConfig = getConfigForDisco(disco.id, "user");
                const agentConfig = getConfigForDisco(disco.id, "agent");
                
                return (
                  <TableRow key={disco.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        <span className="font-medium">{disco.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{disco.region}</Badge>
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
                      ₦{calculateExamplePrice(5000, userConfig).toLocaleString()}
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
                        onClick={() => openEditDialog(disco.id)}
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
        <h4 className="font-medium text-sm">Electricity Pricing Notes</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Electricity payments are processed at face value</li>
          <li>• Fixed profit amounts are recommended for electricity</li>
          <li>• Service charge is added on top of the recharge amount</li>
          <li>• Both Prepaid and Postpaid meters are supported</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminElectricityTab;
