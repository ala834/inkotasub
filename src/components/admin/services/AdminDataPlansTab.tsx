import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Plus, Edit2, Search, Star, Download, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface ProviderPlan {
  provider: string;
  network: string;
  plan_id: string;
  plan_name: string;
  base_price: number;
  validity: string;
  data_size: number;
  db_id: string | null;
  is_enabled: boolean;
  is_featured: boolean;
  selling_price: number | null;
}

const NETWORKS = ["MTN", "AIRTEL", "GLO", "9MOBILE"];
const PROVIDERS = ["smeplug", "subpadi"];

const AdminDataPlansTab = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<ProviderPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setSaving] = useState<string | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);

  // Edit selling price dialog
  const [editPlan, setEditPlan] = useState<ProviderPlan | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [isPriceDialogOpen, setIsPriceDialogOpen] = useState(false);

  // Manual plan dialog
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    provider: "subpadi", network: "MTN", plan_id: "", plan_name: "", base_price: "", validity: "", selling_price: "",
  });

  useEffect(() => { loadPlans(); }, []);

  const loadPlans = async () => {
    setIsLoading(true);
    try {
      // Load from DB
      const { data, error } = await supabase
        .from("service_plans")
        .select("*")
        .eq("service_type", "data")
        .order("network")
        .order("base_price");

      if (!error && data) {
        setPlans(data.map((p: any) => ({
          provider: p.provider || "subpadi",
          network: p.network,
          plan_id: p.plan_id,
          plan_name: p.plan_name,
          base_price: parseFloat(p.base_price),
          validity: p.validity || "30 Days",
          data_size: extractDataSize(p.plan_name),
          db_id: p.id,
          is_enabled: p.is_enabled,
          is_featured: p.is_featured || false,
          selling_price: p.selling_price ? parseFloat(p.selling_price) : null,
        })));
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load plans");
    }
    setIsLoading(false);
  };

  const fetchFromProviders = async () => {
    setIsFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-fetch-data-plans", {
        body: { action: "fetch" },
      });

      if (error) throw error;
      if (data?.success && data.plans) {
        setPlans(data.plans);
        toast.success(`Loaded ${data.total} plans from providers`);
      } else {
        toast.error("No plans returned");
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to fetch from providers");
    }
    setIsFetching(false);
  };

  const togglePlan = async (plan: ProviderPlan, field: "is_enabled" | "is_featured") => {
    const newValue = !plan[field];
    setSaving(plan.plan_id + field);

    try {
      const updatedPlan = { ...plan, [field]: newValue };
      const { data, error } = await supabase.functions.invoke("admin-fetch-data-plans", {
        body: { action: "save_plan", plan: updatedPlan },
      });

      if (error || !data?.success) throw new Error("Save failed");

      setPlans(prev => prev.map(p =>
        p.provider === plan.provider && p.network === plan.network && p.plan_id === plan.plan_id
          ? { ...p, [field]: newValue, db_id: data.plan?.id || p.db_id }
          : p
      ));

      // Log
      await supabase.from("price_change_log").insert({
        admin_id: user?.id,
        change_type: field === "is_enabled" ? (newValue ? "plan_enabled" : "plan_disabled") : (newValue ? "plan_featured" : "plan_unfeatured"),
        new_value: { plan_id: plan.plan_id, provider: plan.provider, network: plan.network, [field]: newValue },
      });
    } catch (e) {
      toast.error("Failed to update plan");
    }
    setSaving(null);
  };

  const saveSellingPrice = async () => {
    if (!editPlan) return;
    setSaving("price");

    try {
      const price = editPrice ? parseFloat(editPrice) : null;
      const updatedPlan = { ...editPlan, selling_price: price };
      const { data, error } = await supabase.functions.invoke("admin-fetch-data-plans", {
        body: { action: "save_plan", plan: updatedPlan },
      });

      if (error || !data?.success) throw new Error("Save failed");

      setPlans(prev => prev.map(p =>
        p.provider === editPlan.provider && p.network === editPlan.network && p.plan_id === editPlan.plan_id
          ? { ...p, selling_price: price, db_id: data.plan?.id || p.db_id }
          : p
      ));

      await supabase.from("price_change_log").insert({
        admin_id: user?.id,
        change_type: "selling_price_set",
        new_value: { plan_id: editPlan.plan_id, provider: editPlan.provider, selling_price: price },
      });

      toast.success("Selling price updated");
      setIsPriceDialogOpen(false);
    } catch (e) {
      toast.error("Failed to save price");
    }
    setSaving(null);
  };

  const saveManualPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving("manual");

    try {
      const plan = {
        provider: manualForm.provider,
        network: manualForm.network,
        plan_id: manualForm.plan_id || `manual_${Date.now()}`,
        plan_name: manualForm.plan_name,
        base_price: parseFloat(manualForm.base_price),
        validity: manualForm.validity || "30 Days",
        is_enabled: true,
        is_featured: false,
        selling_price: manualForm.selling_price ? parseFloat(manualForm.selling_price) : null,
      };

      const { data, error } = await supabase.functions.invoke("admin-fetch-data-plans", {
        body: { action: "save_plan", plan },
      });

      if (error || !data?.success) throw new Error("Save failed");

      toast.success("Manual plan added");
      setIsManualDialogOpen(false);
      setManualForm({ provider: "subpadi", network: "MTN", plan_id: "", plan_name: "", base_price: "", validity: "", selling_price: "" });
      loadPlans();
    } catch (e) {
      toast.error("Failed to add plan");
    }
    setSaving(null);
  };

  const enableAllFromProvider = async (provider: string) => {
    const providerPlans = filteredPlans.filter(p => p.provider === provider && !p.is_enabled);
    if (providerPlans.length === 0) {
      toast.info("All plans already enabled");
      return;
    }

    setSaving("bulk");
    try {
      const toSave = providerPlans.map(p => ({ ...p, is_enabled: true }));
      const { data, error } = await supabase.functions.invoke("admin-fetch-data-plans", {
        body: { action: "bulk_save", plans: toSave },
      });
      if (error || !data?.success) throw new Error("Bulk save failed");
      toast.success(`Enabled ${data.saved} plans from ${provider}`);
      loadPlans();
    } catch (e) {
      toast.error("Failed to bulk enable");
    }
    setSaving(null);
  };

  const filteredPlans = useMemo(() => {
    return plans.filter(p => {
      if (selectedNetwork !== "all" && p.network !== selectedNetwork) return false;
      if (selectedProvider !== "all" && p.provider !== selectedProvider) return false;
      if (showEnabledOnly && !p.is_enabled) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.plan_name.toLowerCase().includes(q) && !p.plan_id.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      if (a.network !== b.network) return a.network.localeCompare(b.network);
      if (a.data_size !== b.data_size) return a.data_size - b.data_size;
      return a.base_price - b.base_price;
    });
  }, [plans, selectedNetwork, selectedProvider, searchQuery, showEnabledOnly]);

  const stats = useMemo(() => ({
    total: plans.length,
    enabled: plans.filter(p => p.is_enabled).length,
    featured: plans.filter(p => p.is_featured).length,
    smeplug: plans.filter(p => p.provider === "smeplug").length,
    subpadi: plans.filter(p => p.provider === "subpadi").length,
  }), [plans]);

  const openPriceDialog = (plan: ProviderPlan) => {
    setEditPlan(plan);
    setEditPrice(plan.selling_price?.toString() || "");
    setIsPriceDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Plans", value: stats.total, color: "bg-muted" },
          { label: "Enabled", value: stats.enabled, color: "bg-green-500/10 text-green-700" },
          { label: "Featured", value: stats.featured, color: "bg-yellow-500/10 text-yellow-700" },
          { label: "SMEPlug", value: stats.smeplug, color: "bg-blue-500/10 text-blue-700" },
          { label: "Subpadi", value: stats.subpadi, color: "bg-purple-500/10 text-purple-700" },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Network" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Networks</SelectItem>
              {NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={selectedProvider} onValueChange={setSelectedProvider}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {PROVIDERS.map(p => <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[180px]"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={showEnabledOnly} onCheckedChange={setShowEnabledOnly} />
            <span className="text-xs text-muted-foreground">Enabled only</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchFromProviders} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Fetching..." : "Refresh from APIs"}
          </Button>

          <Dialog open={isManualDialogOpen} onOpenChange={setIsManualDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Plan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Manual Plan</DialogTitle>
              </DialogHeader>
              <form onSubmit={saveManualPlan} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select value={manualForm.provider} onValueChange={v => setManualForm(f => ({ ...f, provider: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map(p => <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Network</Label>
                    <Select value={manualForm.network} onValueChange={v => setManualForm(f => ({ ...f, network: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Plan ID</Label>
                    <Input value={manualForm.plan_id} onChange={e => setManualForm(f => ({ ...f, plan_id: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="space-y-2">
                    <Label>Plan Name</Label>
                    <Input value={manualForm.plan_name} onChange={e => setManualForm(f => ({ ...f, plan_name: e.target.value }))} placeholder="1GB (30 Days)" required />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Provider Price (₦)</Label>
                    <Input type="number" value={manualForm.base_price} onChange={e => setManualForm(f => ({ ...f, base_price: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Selling Price (₦)</Label>
                    <Input type="number" value={manualForm.selling_price} onChange={e => setManualForm(f => ({ ...f, selling_price: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="space-y-2">
                    <Label>Validity</Label>
                    <Input value={manualForm.validity} onChange={e => setManualForm(f => ({ ...f, validity: e.target.value }))} placeholder="30 Days" />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isSaving === "manual"}>
                  {isSaving === "manual" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Add Plan
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Bulk actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => enableAllFromProvider("smeplug")} disabled={!!isSaving}>
          <Download className="h-3 w-3 mr-1" /> Enable all SMEPlug
        </Button>
        <Button variant="outline" size="sm" onClick={() => enableAllFromProvider("subpadi")} disabled={!!isSaving}>
          <Download className="h-3 w-3 mr-1" /> Enable all Subpadi
        </Button>
      </div>

      {/* Price Dialog */}
      <Dialog open={isPriceDialogOpen} onOpenChange={setIsPriceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Selling Price</DialogTitle>
          </DialogHeader>
          {editPlan && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><span className="font-medium">Plan:</span> {editPlan.plan_name}</p>
                <p><span className="font-medium">Provider:</span> {editPlan.provider.toUpperCase()}</p>
                <p><span className="font-medium">Network:</span> {editPlan.network}</p>
                <p><span className="font-medium">Provider Price:</span> ₦{editPlan.base_price.toLocaleString()}</p>
              </div>
              <div className="space-y-2">
                <Label>Selling Price (₦)</Label>
                <Input
                  type="number"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  placeholder="Leave empty to use pricing config"
                />
                {editPrice && (
                  <p className="text-xs text-muted-foreground">
                    Profit: ₦{(parseFloat(editPrice) - editPlan.base_price).toLocaleString()}
                    ({((parseFloat(editPrice) - editPlan.base_price) / editPlan.base_price * 100).toFixed(1)}%)
                  </p>
                )}
              </div>
              <Button onClick={saveSellingPrice} className="w-full" disabled={isSaving === "price"}>
                {isSaving === "price" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Price
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Network</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Provider Price</TableHead>
              <TableHead className="text-right">Selling Price</TableHead>
              <TableHead>Validity</TableHead>
              <TableHead className="text-center">Enabled</TableHead>
              <TableHead className="text-center">Featured</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredPlans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No plans found. Click "Refresh from APIs" to fetch plans.
                </TableCell>
              </TableRow>
            ) : (
              filteredPlans.map((plan) => {
                const key = `${plan.provider}:${plan.network}:${plan.plan_id}`;
                return (
                  <TableRow key={key} className={!plan.is_enabled ? "opacity-60" : ""}>
                    <TableCell>
                      <Badge variant={plan.provider === "smeplug" ? "default" : "secondary"} className="text-[10px]">
                        {plan.provider.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{plan.network}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm">{plan.plan_name}</span>
                        {plan.is_featured && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ₦{plan.base_price.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium text-primary">
                      {plan.selling_price ? `₦${plan.selling_price.toLocaleString()}` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">{plan.validity || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={plan.is_enabled}
                        onCheckedChange={() => togglePlan(plan, "is_enabled")}
                        disabled={isSaving === plan.plan_id + "is_enabled"}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={plan.is_featured}
                        onCheckedChange={() => togglePlan(plan, "is_featured")}
                        disabled={isSaving === plan.plan_id + "is_featured"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openPriceDialog(plan)} className="gap-1 text-xs">
                        <Edit2 className="h-3 w-3" />
                        Price
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground">
        Showing {filteredPlans.length} of {plans.length} plans
      </div>
    </div>
  );
};

function extractDataSize(name: string): number {
  const gb = name.match(/(\d+(?:\.\d+)?)\s*GB/i);
  if (gb) return parseFloat(gb[1]) * 1024;
  const mb = name.match(/(\d+(?:\.\d+)?)\s*MB/i);
  if (mb) return parseFloat(mb[1]);
  return 99999;
}

export default AdminDataPlansTab;
