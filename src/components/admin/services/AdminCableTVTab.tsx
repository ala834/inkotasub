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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Plus, Edit2, Search, Tv, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface ServicePlan {
  id: string;
  service_type: string;
  network: string;
  plan_id: string;
  plan_name: string;
  base_price: number;
  is_enabled: boolean;
  is_manual: boolean;
  last_synced_at: string | null;
}

interface PricingConfig {
  id: string;
  network: string | null;
  plan_id: string | null;
  profit_type: string;
  profit_value: number;
  user_type: string;
}

const PROVIDERS = [
  { id: "DSTV", name: "DStv", icon: "📺" },
  { id: "GOTV", name: "GOtv", icon: "📡" },
  { id: "STARTIMES", name: "StarTimes", icon: "⭐" },
];

const AdminCableTVTab = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [pricingConfigs, setPricingConfigs] = useState<PricingConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: number; invalid: number; message: string } | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("DSTV");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    network: "DSTV",
    plan_id: "",
    plan_name: "",
    base_price: "",
  });

  const [isProfitDialogOpen, setIsProfitDialogOpen] = useState(false);
  const [editingPlanForProfit, setEditingPlanForProfit] = useState<ServicePlan | null>(null);
  const [profitData, setProfitData] = useState({
    profit_type: "fixed",
    profit_value: "",
    user_type: "user",
  });

  useEffect(() => {
    fetchPlans();
    fetchPricingConfigs();
  }, []);

  const fetchPlans = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("service_plans")
      .select("*")
      .eq("service_type", "cable")
      .order("network")
      .order("base_price");

    if (!error && data) {
      setPlans(data.map(p => ({ ...p, base_price: parseFloat(p.base_price as unknown as string) })));
    }
    setIsLoading(false);
  };

  const fetchPricingConfigs = async () => {
    const { data } = await supabase
      .from("pricing_config")
      .select("*")
      .eq("service_type", "cable")
      .eq("is_active", true);

    if (data) {
      setPricingConfigs(data.map(c => ({
        ...c,
        profit_value: parseFloat(c.profit_value as unknown as string),
      })));
    }
  };

  const syncFromSubpadi = async () => {
    setIsSyncing(true);
    try {
      for (const provider of PROVIDERS) {
        const { data, error } = await supabase.functions.invoke("get-cable-plans", {
          body: { provider: provider.id },
        });

        if (error) {
          console.error(`Error fetching ${provider.id} plans:`, error);
          continue;
        }

        if (data?.plans) {
          for (const plan of data.plans) {
            await supabase
              .from("service_plans")
              .upsert({
                service_type: "cable",
                network: provider.id,
                plan_id: plan.id,
                plan_name: plan.name,
                base_price: plan.amount,
                last_synced_at: new Date().toISOString(),
                is_manual: false,
              }, {
                onConflict: "service_type,network,plan_id",
              });
          }
        }
      }

      await supabase.from("price_change_log").insert({
        admin_id: user?.id,
        change_type: "plan_synced",
        new_value: { service_type: "cable", providers: PROVIDERS.map(p => p.id) },
      });

      toast.success("Cable TV plans synced");
      fetchPlans();
    } catch (error) {
      console.error("Sync error:", error);
      toast.error("Failed to sync plans");
    }
    setIsSyncing(false);
  };

  const validatePlans = async () => {
    setIsValidating(true);
    setValidationResult(null);
    let totalValid = 0;
    let totalInvalid = 0;

    try {
      const providers = [selectedProvider];
      for (const provider of providers) {
        const { data, error } = await supabase.functions.invoke("sync-cable-plans", {
          body: { action: "cleanup", provider, limit: 200 },
        });

        if (error) {
          console.error(`Validation error for ${provider}:`, error);
          toast.error(`Failed to validate ${provider} plans`);
          continue;
        }

        totalValid += data?.validCount || 0;
        totalInvalid += data?.invalidCount || 0;
      }

      setValidationResult({ valid: totalValid, invalid: totalInvalid, message: `${totalValid} valid, ${totalInvalid} invalid plans disabled` });

      if (totalInvalid > 0) {
        toast.success(`Validation complete: ${totalInvalid} stale plans disabled`);
        fetchPlans();
      } else {
        toast.success("All plans are valid!");
      }
    } catch (error) {
      console.error("Validation error:", error);
      toast.error("Failed to validate plans");
    }
    setIsValidating(false);
  };

  const handleToggleEnabled = async (plan: ServicePlan) => {
    const { error } = await supabase
      .from("service_plans")
      .update({ is_enabled: !plan.is_enabled })
      .eq("id", plan.id);

    if (error) {
      toast.error("Failed to update plan");
    } else {
      await supabase.from("price_change_log").insert({
        admin_id: user?.id,
        plan_id: plan.id,
        change_type: plan.is_enabled ? "plan_disabled" : "plan_enabled",
        old_value: { is_enabled: plan.is_enabled },
        new_value: { is_enabled: !plan.is_enabled },
      });
      fetchPlans();
    }
  };

  const handleAddManualPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { error } = await supabase
        .from("service_plans")
        .insert({
          service_type: "cable",
          network: formData.network,
          plan_id: formData.plan_id || `manual_${Date.now()}`,
          plan_name: formData.plan_name,
          base_price: parseFloat(formData.base_price),
          is_manual: true,
        });

      if (error) throw error;
      
      await supabase.from("price_change_log").insert({
        admin_id: user?.id,
        change_type: "plan_added",
        new_value: { ...formData, service_type: "cable" },
      });

      toast.success("Cable TV plan added");
      setIsDialogOpen(false);
      setFormData({ network: "DSTV", plan_id: "", plan_name: "", base_price: "" });
      fetchPlans();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to add plan");
    }
  };

  const handleSetProfit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanForProfit) return;

    try {
      const existingConfig = pricingConfigs.find(
        c => c.network === editingPlanForProfit.network && 
            c.plan_id === editingPlanForProfit.plan_id &&
            c.user_type === profitData.user_type
      );

      const configData = {
        service_type: "cable",
        network: editingPlanForProfit.network,
        plan_id: editingPlanForProfit.plan_id,
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
        plan_id: editingPlanForProfit.id,
        change_type: "profit_updated",
        old_value: existingConfig ? { profit_value: existingConfig.profit_value } : null,
        new_value: { profit_type: profitData.profit_type, profit_value: parseFloat(profitData.profit_value) },
      });

      toast.success("Profit margin updated");
      setIsProfitDialogOpen(false);
      fetchPricingConfigs();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to set profit");
    }
  };

  const getProfitForPlan = (plan: ServicePlan, userType: string = "user") => {
    return pricingConfigs.find(
      c => c.network === plan.network && c.plan_id === plan.plan_id && c.user_type === userType
    ) || pricingConfigs.find(
      c => c.network === plan.network && !c.plan_id && c.user_type === userType
    ) || pricingConfigs.find(
      c => !c.network && !c.plan_id && c.user_type === userType
    );
  };

  const calculateFinalPrice = (plan: ServicePlan) => {
    const config = getProfitForPlan(plan);
    if (!config) return plan.base_price;
    if (config.profit_type === "percentage") {
      return Math.round(plan.base_price * (1 + config.profit_value / 100));
    }
    return plan.base_price + config.profit_value;
  };

  const formatProfit = (config: PricingConfig | undefined) => {
    if (!config) return "Not set";
    return config.profit_type === "percentage" 
      ? `${config.profit_value}%` 
      : `₦${config.profit_value.toLocaleString()}`;
  };

  const filteredPlans = plans.filter(plan => {
    const matchesProvider = plan.network === selectedProvider;
    const matchesSearch = plan.plan_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesProvider && matchesSearch;
  });

  const openProfitDialog = (plan: ServicePlan) => {
    const existingConfig = getProfitForPlan(plan, "user");
    setEditingPlanForProfit(plan);
    setProfitData({
      profit_type: existingConfig?.profit_type || "fixed",
      profit_value: existingConfig?.profit_value?.toString() || "",
      user_type: "user",
    });
    setIsProfitDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Tv className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Cable TV Plans</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={syncFromSubpadi}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            Sync Plans
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Plan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Cable TV Plan</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddManualPlan} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select value={formData.network} onValueChange={(v) => setFormData(prev => ({ ...prev, network: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.icon} {p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Plan ID</Label>
                    <Input
                      value={formData.plan_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, plan_id: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Plan Name</Label>
                  <Input
                    value={formData.plan_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, plan_name: e.target.value }))}
                    placeholder="e.g., DStv Premium"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Base Price (₦)</Label>
                  <Input
                    type="number"
                    value={formData.base_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, base_price: e.target.value }))}
                    placeholder="24500"
                    required
                  />
                </div>
                <Button type="submit" className="w-full">Add Plan</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={selectedProvider} onValueChange={setSelectedProvider}>
        <TabsList>
          {PROVIDERS.map(p => (
            <TabsTrigger key={p.id} value={p.id} className="gap-2">
              <span>{p.icon}</span>
              <span>{p.name}</span>
              <Badge variant="secondary" className="ml-1 text-xs">
                {plans.filter(plan => plan.network === p.id).length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search plans..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 max-w-xs"
        />
      </div>

      <Dialog open={isProfitDialogOpen} onOpenChange={setIsProfitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Profit for {editingPlanForProfit?.plan_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSetProfit} className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p><span className="font-medium">Provider:</span> {editingPlanForProfit?.network}</p>
              <p><span className="font-medium">Base Price:</span> ₦{editingPlanForProfit?.base_price?.toLocaleString()}</p>
            </div>
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
                    <SelectItem value="fixed">Fixed (₦)</SelectItem>
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
                  placeholder={profitData.profit_type === "fixed" ? "100" : "2"}
                  required
                />
              </div>
            </div>
            {profitData.profit_value && editingPlanForProfit && (
              <div className="p-3 bg-primary/10 rounded-lg text-sm">
                <p className="font-medium">Final User Price:</p>
                <p className="text-lg font-bold">
                  ₦{(profitData.profit_type === "percentage"
                    ? Math.round(editingPlanForProfit.base_price * (1 + parseFloat(profitData.profit_value || "0") / 100))
                    : editingPlanForProfit.base_price + parseFloat(profitData.profit_value || "0")
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
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Base Price</TableHead>
              <TableHead className="text-right">Profit</TableHead>
              <TableHead className="text-right">User Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">Loading...</TableCell>
              </TableRow>
            ) : filteredPlans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No plans found for {selectedProvider}. Click "Sync Plans" to fetch.
                </TableCell>
              </TableRow>
            ) : (
              filteredPlans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{plan.plan_name}</span>
                      {plan.is_manual && (
                        <Badge variant="secondary" className="text-xs">Manual</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ₦{plan.base_price.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatProfit(getProfitForPlan(plan))}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-primary">
                    ₦{calculateFinalPrice(plan).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={plan.is_enabled}
                      onCheckedChange={() => handleToggleEnabled(plan)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openProfitDialog(plan)}
                      className="gap-1"
                    >
                      <Edit2 className="h-3 w-3" />
                      Set Profit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminCableTVTab;
