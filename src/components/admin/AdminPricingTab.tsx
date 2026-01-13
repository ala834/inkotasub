import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface PricingConfig {
  id: string;
  service_type: string;
  network: string | null;
  plan_id: string | null;
  user_type: string;
  profit_type: string;
  profit_value: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const AdminPricingTab = () => {
  const [pricingConfigs, setPricingConfigs] = useState<PricingConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<PricingConfig | null>(null);
  
  // Form state
  const [serviceType, setServiceType] = useState("airtime");
  const [network, setNetwork] = useState<string>("");
  const [planId, setPlanId] = useState<string>("");
  const [userType, setUserType] = useState("user");
  const [profitType, setProfitType] = useState("percentage");
  const [profitValue, setProfitValue] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchPricingConfigs();
  }, []);

  const fetchPricingConfigs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("pricing_config")
      .select("*")
      .order("service_type", { ascending: true })
      .order("user_type", { ascending: true });

    if (!error && data) {
      setPricingConfigs(data.map(c => ({
        ...c,
        profit_value: parseFloat(c.profit_value as unknown as string),
      })));
    }
    setIsLoading(false);
  };

  const resetForm = () => {
    setServiceType("airtime");
    setNetwork("");
    setPlanId("");
    setUserType("user");
    setProfitType("percentage");
    setProfitValue("");
    setIsActive(true);
    setEditingConfig(null);
  };

  const handleEdit = (config: PricingConfig) => {
    setEditingConfig(config);
    setServiceType(config.service_type);
    setNetwork(config.network || "");
    setPlanId(config.plan_id || "");
    setUserType(config.user_type);
    setProfitType(config.profit_type);
    setProfitValue(config.profit_value.toString());
    setIsActive(config.is_active);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const configData = {
      service_type: serviceType,
      network: network || null,
      plan_id: planId || null,
      user_type: userType,
      profit_type: profitType,
      profit_value: parseFloat(profitValue),
      is_active: isActive,
    };

    try {
      if (editingConfig) {
        const { error } = await supabase
          .from("pricing_config")
          .update(configData)
          .eq("id", editingConfig.id);

        if (error) throw error;
        toast.success("Pricing config updated");
      } else {
        const { error } = await supabase
          .from("pricing_config")
          .insert(configData);

        if (error) throw error;
        toast.success("Pricing config created");
      }

      resetForm();
      setIsDialogOpen(false);
      fetchPricingConfigs();
    } catch (error: unknown) {
      console.error("Error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save pricing config");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this pricing config?")) return;

    const { error } = await supabase
      .from("pricing_config")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete pricing config");
    } else {
      toast.success("Pricing config deleted");
      fetchPricingConfigs();
    }
  };

  const handleToggleActive = async (config: PricingConfig) => {
    const { error } = await supabase
      .from("pricing_config")
      .update({ is_active: !config.is_active })
      .eq("id", config.id);

    if (error) {
      toast.error("Failed to update pricing config");
    } else {
      fetchPricingConfigs();
    }
  };

  const formatProfitDisplay = (config: PricingConfig) => {
    if (config.profit_type === "percentage") {
      return `${config.profit_value}%`;
    }
    return `₦${config.profit_value.toLocaleString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Pricing Configuration</h3>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Add Pricing
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingConfig ? "Edit Pricing Config" : "Add Pricing Config"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Service Type</Label>
                  <Select value={serviceType} onValueChange={setServiceType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="airtime">Airtime</SelectItem>
                      <SelectItem value="data">Data</SelectItem>
                      <SelectItem value="electricity">Electricity</SelectItem>
                      <SelectItem value="cable">Cable TV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>User Type</Label>
                  <Select value={userType} onValueChange={setUserType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Regular User</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Network (optional)</Label>
                  <Select value={network} onValueChange={setNetwork}>
                    <SelectTrigger>
                      <SelectValue placeholder="All networks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Networks</SelectItem>
                      <SelectItem value="MTN">MTN</SelectItem>
                      <SelectItem value="AIRTEL">Airtel</SelectItem>
                      <SelectItem value="GLO">Glo</SelectItem>
                      <SelectItem value="9MOBILE">9mobile</SelectItem>
                      <SelectItem value="DSTV">DSTV</SelectItem>
                      <SelectItem value="GOTV">GOTV</SelectItem>
                      <SelectItem value="STARTIMES">StarTimes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Plan ID (optional)</Label>
                  <Input
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    placeholder="Specific plan ID"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Profit Type</Label>
                  <Select value={profitType} onValueChange={setProfitType}>
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
                    value={profitValue}
                    onChange={(e) => setProfitValue(e.target.value)}
                    placeholder={profitType === "percentage" ? "5" : "100"}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <Label>Active</Label>
              </div>

              <Button type="submit" className="w-full">
                {editingConfig ? "Update" : "Create"} Pricing Config
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Network</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>User Type</TableHead>
              <TableHead>Profit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : pricingConfigs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No pricing configs found
                </TableCell>
              </TableRow>
            ) : (
              pricingConfigs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="capitalize font-medium">
                    {config.service_type}
                  </TableCell>
                  <TableCell>{config.network || "All"}</TableCell>
                  <TableCell>{config.plan_id || "All"}</TableCell>
                  <TableCell className="capitalize">{config.user_type}</TableCell>
                  <TableCell>{formatProfitDisplay(config)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={config.is_active}
                      onCheckedChange={() => handleToggleActive(config)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(config)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(config.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="glass-card rounded-xl p-4 space-y-2">
        <h4 className="font-medium text-sm">Pricing Rules</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• More specific configs (network + plan) override general configs</li>
          <li>• Percentage profit is added on top of SUBPADI base cost</li>
          <li>• Fixed profit is a flat amount added to base cost</li>
          <li>• Agent pricing typically has lower profit margins</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminPricingTab;