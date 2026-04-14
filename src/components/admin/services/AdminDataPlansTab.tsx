import { useState, useEffect, useMemo, useCallback } from "react";
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
import { RefreshCw, Plus, Edit2, Search, Star, Download, Loader2, Trash2, AlertTriangle, CheckCircle, XCircle, Clock, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  plan_type: string;
}

const NETWORKS = ["MTN", "AIRTEL", "GLO", "9MOBILE"];
const PROVIDERS = ["smeplug", "subpadi"];
const PLAN_TYPES = ["SME", "GIFTING", "CORPORATE", "GENERAL"];

const PLAN_TYPE_COLORS: Record<string, string> = {
  SME: "bg-blue-500/10 text-blue-700 border-blue-200",
  GIFTING: "bg-green-500/10 text-green-700 border-green-200",
  CORPORATE: "bg-purple-500/10 text-purple-700 border-purple-200",
  GENERAL: "bg-muted text-muted-foreground border-border",
};

interface SyncLogEntry {
  timestamp: string;
  action: string;
  status: "success" | "error" | "info";
  message: string;
}

const AdminDataPlansTab = () => {
  const { user } = useAuth();
  const [isFetchingSubpadi, setIsFetchingSubpadi] = useState(false);
  const [plans, setPlans] = useState<ProviderPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setSaving] = useState<string | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [selectedPlanType, setSelectedPlanType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [groupByType, setGroupByType] = useState(true);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Edit selling price dialog
  const [editPlan, setEditPlan] = useState<ProviderPlan | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [isPriceDialogOpen, setIsPriceDialogOpen] = useState(false);

  // Manual plan dialog
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    provider: "subpadi", network: "MTN", plan_id: "", plan_name: "", base_price: "", validity: "", selling_price: "", plan_type: "GENERAL",
  });

  const addLog = useCallback((action: string, status: SyncLogEntry["status"], message: string) => {
    setSyncLogs(prev => [{ timestamp: new Date().toLocaleTimeString(), action, status, message }, ...prev].slice(0, 50));
  }, []);

  useEffect(() => { loadPlans(); }, []);

  const loadPlans = async () => {
    setIsLoading(true);
    try {
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
          plan_type: p.plan_type || categorizePlan(p.plan_name),
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
    addLog("Sync", "info", "Starting full sync from SMEPlug & Subpadi APIs...");
    try {
      const { data, error } = await supabase.functions.invoke("admin-fetch-data-plans", {
        body: { action: "fetch" },
      });

      if (error) throw error;
      if (data?.success && data.plans) {
        setPlans(data.plans.map((p: any) => ({
          ...p,
          plan_type: p.plan_type || categorizePlan(p.plan_name),
        })));
        const smeplugCount = data.smeplugCount || data.plans.filter((p: any) => p.provider === "smeplug").length;
        const subpadiCount = data.subpadiCount || data.plans.filter((p: any) => p.provider === "subpadi").length;
        addLog("Sync", "success", `Loaded ${data.total} plans (SMEPlug: ${smeplugCount}, Subpadi: ${subpadiCount})`);
        toast.success(`Loaded ${data.total} plans (SMEPlug: ${smeplugCount}, Subpadi: ${subpadiCount})`);
        if (data.errors?.length) {
          data.errors.forEach((e: string) => {
            addLog("Sync", "error", e);
            toast.info(e, { duration: 8000 });
          });
        }
      } else {
        addLog("Sync", "error", "No plans returned from APIs");
        toast.error("No plans returned");
      }
    } catch (e: any) {
      console.error(e);
      addLog("Sync", "error", `Failed: ${e.message || "Unknown error"}`);
      toast.error("Failed to fetch from providers");
    }
    setIsFetching(false);
  };

  const fetchSubpadiPlans = async () => {
    setIsFetchingSubpadi(true);
    addLog("Subpadi", "info", "Fetching Subpadi plans from API...");
    try {
      const { data, error } = await supabase.functions.invoke("admin-fetch-data-plans", {
        body: { action: "fetch_subpadi" },
      });

      if (error) throw error;
      
      if (data?.fromApi && data.saved > 0) {
        addLog("Subpadi", "success", `Fetched and saved ${data.saved} plans from API`);
        toast.success(`Fetched and saved ${data.saved} Subpadi plans from API`);
        loadPlans();
      } else if (data?.existingInDb > 0) {
        addLog("Subpadi", "info", `API returned no plan data. ${data.existingInDb} plans in database.`);
        toast.info(`Subpadi API did not return plan data. ${data.existingInDb} plans already in database.`, { duration: 8000 });
      } else {
        addLog("Subpadi", "error", data?.message || "No Subpadi plans found");
        toast.info(data?.message || "No Subpadi plans found. Add them manually.", { duration: 8000 });
      }
    } catch (e: any) {
      console.error(e);
      addLog("Subpadi", "error", `Failed: ${e.message || "Unknown error"}`);
      toast.error("Failed to fetch Subpadi plans");
    }
    setIsFetchingSubpadi(false);
  };

  const validatePlans = async () => {
    setIsValidating(true);
    addLog("Validate", "info", "Validating plans against Subpadi API...");
    try {
      const { data, error } = await supabase.functions.invoke("sync-data-plans", {
        body: { action: "validate", limit: 50 },
      });

      if (error) throw error;
      
      addLog("Validate", "success", data?.message || "Validation complete");
      if (data?.invalidCount > 0) {
        addLog("Validate", "error", `${data.invalidCount} invalid plans found: ${data.invalidPlans?.map((p: any) => `${p.network} ${p.plan_name}`).join(", ")}`);
        toast.warning(`${data.invalidCount} invalid plans found. Use "Cleanup" to disable them.`);
      } else {
        toast.success(`All ${data?.validCount || 0} plans are valid`);
      }
      if (data?.errors?.length) {
        data.errors.forEach((e: any) => addLog("Validate", "error", `${e.network} plan ${e.plan_id}: ${e.error}`));
      }
    } catch (e: any) {
      addLog("Validate", "error", `Failed: ${e.message || "Unknown error"}`);
      toast.error("Failed to validate plans");
    }
    setIsValidating(false);
  };

  const cleanupInvalidPlans = async () => {
    setIsValidating(true);
    addLog("Cleanup", "info", "Running cleanup — disabling invalid plans...");
    try {
      const { data, error } = await supabase.functions.invoke("sync-data-plans", {
        body: { action: "cleanup", limit: 100 },
      });

      if (error) throw error;
      
      addLog("Cleanup", "success", data?.message || "Cleanup complete");
      if (data?.invalidCount > 0) {
        toast.success(`Disabled ${data.invalidCount} invalid plans`);
        loadPlans();
      } else {
        toast.info("No invalid plans found");
      }
    } catch (e: any) {
      addLog("Cleanup", "error", `Failed: ${e.message || "Unknown error"}`);
      toast.error("Failed to cleanup plans");
    }
    setIsValidating(false);
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
        plan_type: manualForm.plan_type,
      };

      const { data, error } = await supabase.functions.invoke("admin-fetch-data-plans", {
        body: { action: "save_plan", plan },
      });

      if (error || !data?.success) throw new Error("Save failed");

      toast.success("Manual plan added");
      setIsManualDialogOpen(false);
      setManualForm({ provider: "subpadi", network: "MTN", plan_id: "", plan_name: "", base_price: "", validity: "", selling_price: "", plan_type: "GENERAL" });
      loadPlans();
    } catch (e) {
      toast.error("Failed to add plan");
    }
    setSaving(null);
  };

  const bulkAction = async (actionType: string) => {
    setSaving("bulk");
    try {
      let toUpdate: ProviderPlan[] = [];
      let field: "is_enabled" = "is_enabled";
      let newValue = true;

      switch (actionType) {
        case "enable_smeplug":
          toUpdate = filteredPlans.filter(p => p.provider === "smeplug" && !p.is_enabled);
          break;
        case "enable_subpadi":
          toUpdate = filteredPlans.filter(p => p.provider === "subpadi" && !p.is_enabled);
          break;
        case "disable_expensive": {
          // For each network+plan_type combo, if the same size exists cheaper, disable the expensive one
          const groups = new Map<string, ProviderPlan[]>();
          filteredPlans.forEach(p => {
            const key = `${p.network}:${p.plan_type}:${p.data_size}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(p);
          });
          groups.forEach(group => {
            if (group.length > 1) {
              const sorted = [...group].sort((a, b) => a.base_price - b.base_price);
              // Disable all but cheapest
              toUpdate.push(...sorted.slice(1).filter(p => p.is_enabled));
            }
          });
          newValue = false;
          break;
        }
        case "disable_all":
          toUpdate = filteredPlans.filter(p => p.is_enabled);
          newValue = false;
          break;
      }

      if (toUpdate.length === 0) {
        toast.info("No plans to update");
        setSaving(null);
        return;
      }

      const toSave = toUpdate.map(p => ({ ...p, [field]: newValue }));
      const { data, error } = await supabase.functions.invoke("admin-fetch-data-plans", {
        body: { action: "bulk_save", plans: toSave },
      });
      if (error || !data?.success) throw new Error("Bulk save failed");
      toast.success(`Updated ${data.saved} plans`);
      loadPlans();
    } catch (e) {
      toast.error("Failed to perform bulk action");
    }
    setSaving(null);
  };

  // Detect duplicates (same network + similar data size from different providers)
  const duplicates = useMemo(() => {
    const groups = new Map<string, ProviderPlan[]>();
    plans.forEach(p => {
      const key = `${p.network}:${p.data_size}:${p.plan_type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    });
    const dupes: { key: string; plans: ProviderPlan[] }[] = [];
    groups.forEach((group, key) => {
      if (group.length > 1 && group.some(p => p.provider === "smeplug") && group.some(p => p.provider === "subpadi")) {
        dupes.push({ key, plans: group });
      }
    });
    return dupes;
  }, [plans]);

  const filteredPlans = useMemo(() => {
    return plans.filter(p => {
      if (selectedNetwork !== "all" && p.network !== selectedNetwork) return false;
      if (selectedProvider !== "all" && p.provider !== selectedProvider) return false;
      if (selectedPlanType !== "all" && p.plan_type !== selectedPlanType) return false;
      if (showEnabledOnly && !p.is_enabled) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.plan_name.toLowerCase().includes(q) && !p.plan_id.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      if (a.network !== b.network) return a.network.localeCompare(b.network);
      if (a.plan_type !== b.plan_type) return a.plan_type.localeCompare(b.plan_type);
      if (a.data_size !== b.data_size) return a.data_size - b.data_size;
      return a.base_price - b.base_price;
    });
  }, [plans, selectedNetwork, selectedProvider, selectedPlanType, searchQuery, showEnabledOnly]);

  const groupedPlans = useMemo(() => {
    if (!groupByType) return { "All Plans": filteredPlans };
    const groups: Record<string, ProviderPlan[]> = {};
    filteredPlans.forEach(p => {
      const type = p.plan_type || "GENERAL";
      if (!groups[type]) groups[type] = [];
      groups[type].push(p);
    });
    return groups;
  }, [filteredPlans, groupByType]);

  const stats = useMemo(() => ({
    total: plans.length,
    enabled: plans.filter(p => p.is_enabled).length,
    featured: plans.filter(p => p.is_featured).length,
    smeplug: plans.filter(p => p.provider === "smeplug").length,
    subpadi: plans.filter(p => p.provider === "subpadi").length,
    duplicates: duplicates.length,
  }), [plans, duplicates]);

  const openPriceDialog = (plan: ProviderPlan) => {
    setEditPlan(plan);
    setEditPrice(plan.selling_price?.toString() || "");
    setIsPriceDialogOpen(true);
  };

  const renderPlanTable = (planList: ProviderPlan[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Provider</TableHead>
          <TableHead>Network</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Cost Price</TableHead>
          <TableHead className="text-right">Selling Price</TableHead>
          <TableHead>Validity</TableHead>
          <TableHead className="text-center">Enabled</TableHead>
          <TableHead className="text-center">Featured</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {planList.length === 0 ? (
          <TableRow>
            <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
              No plans found
            </TableCell>
          </TableRow>
        ) : (
          planList.map((plan) => {
            const key = `${plan.provider}:${plan.network}:${plan.plan_id}`;
            const isDuplicate = duplicates.some(d => d.plans.includes(plan));
            return (
              <TableRow key={key} className={`${!plan.is_enabled ? "opacity-60" : ""} ${isDuplicate ? "bg-yellow-500/5" : ""}`}>
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
                    {isDuplicate && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${PLAN_TYPE_COLORS[plan.plan_type] || ""}`}>
                    {plan.plan_type}
                  </Badge>
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
  );

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { label: "Total Plans", value: stats.total, color: "bg-muted" },
          { label: "Enabled", value: stats.enabled, color: "bg-green-500/10 text-green-700" },
          { label: "Featured", value: stats.featured, color: "bg-yellow-500/10 text-yellow-700" },
          { label: "SMEPlug", value: stats.smeplug, color: "bg-blue-500/10 text-blue-700" },
          { label: "Subpadi", value: stats.subpadi, color: "bg-purple-500/10 text-purple-700" },
          { label: "Duplicates", value: stats.duplicates, color: stats.duplicates > 0 ? "bg-yellow-500/10 text-yellow-700" : "bg-muted" },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Subpadi info banner */}
      <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-900/10">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium text-purple-700 dark:text-purple-400">
                Subpadi Plans: {stats.subpadi} {stats.subpadi > 0 ? "loaded" : "— none found"}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.subpadi > 0
                  ? "Plans loaded from database. Click 'Fetch Subpadi' to check for new plans from API."
                  : "Click 'Fetch Subpadi' to try the API, or add plans manually using IDs from the Subpadi dashboard."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchSubpadiPlans} disabled={isFetchingSubpadi} className="gap-1">
                <Download className={`h-3 w-3 ${isFetchingSubpadi ? "animate-spin" : ""}`} />
                {isFetchingSubpadi ? "Fetching..." : "Fetch Subpadi"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setManualForm(f => ({ ...f, provider: "subpadi" })); setIsManualDialogOpen(true); }}>
                <Plus className="h-3 w-3 mr-1" /> Add Manual
              </Button>
              {stats.subpadi > 0 && (
                <Button variant="outline" size="sm" onClick={() => bulkAction("enable_subpadi")} disabled={!!isSaving}>
                  Enable All Subpadi
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Duplicate warnings */}
      {duplicates.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50 dark:bg-yellow-900/10">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="h-4 w-4" />
              {duplicates.length} duplicate plan{duplicates.length !== 1 ? "s" : ""} detected (same size from both providers)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-xs text-muted-foreground mb-2">
              Use "Disable Expensive Duplicates" to auto-keep only the cheaper provider for each.
            </p>
            <Button variant="outline" size="sm" onClick={() => bulkAction("disable_expensive")} disabled={!!isSaving}>
              <Trash2 className="h-3 w-3 mr-1" /> Disable Expensive Duplicates
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Validate & Cleanup */}
      <Card className="border-border">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium">Plan Validation & Cleanup</p>
              <p className="text-xs text-muted-foreground">
                Validate plans against provider APIs and auto-disable stale/invalid ones.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={validatePlans} disabled={isValidating} className="gap-1">
                <Shield className={`h-3 w-3 ${isValidating ? "animate-spin" : ""}`} />
                {isValidating ? "Validating..." : "Validate Plans"}
              </Button>
              <Button variant="outline" size="sm" onClick={cleanupInvalidPlans} disabled={isValidating} className="gap-1 text-destructive border-destructive/30">
                <Trash2 className="h-3 w-3" />
                Cleanup Invalid
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowLogs(!showLogs)} className="gap-1">
                <Clock className="h-3 w-3" />
                {showLogs ? "Hide Logs" : "Show Logs"} {syncLogs.length > 0 && `(${syncLogs.length})`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync Logs Panel */}
      {showLogs && syncLogs.length > 0 && (
        <Card className="border-border">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Sync & Validation Logs</span>
              <Button variant="ghost" size="sm" onClick={() => setSyncLogs([])} className="text-xs h-6">Clear</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 max-h-48 overflow-y-auto">
            <div className="space-y-1">
              {syncLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                  {log.status === "success" ? <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" /> :
                   log.status === "error" ? <XCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" /> :
                   <Clock className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />}
                  <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">{log.action}</Badge>
                  <span className="text-foreground">{log.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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

          <Select value={selectedPlanType} onValueChange={setSelectedPlanType}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Plan Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {PLAN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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

          <div className="flex items-center gap-2">
            <Switch checked={groupByType} onCheckedChange={setGroupByType} />
            <span className="text-xs text-muted-foreground">Group by type</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchFromProviders} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Syncing..." : "Sync from APIs"}
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
                    <Label>Plan Type</Label>
                    <Select value={manualForm.plan_type} onValueChange={v => setManualForm(f => ({ ...f, plan_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLAN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Plan Name</Label>
                    <Input value={manualForm.plan_name} onChange={e => setManualForm(f => ({ ...f, plan_name: e.target.value }))} placeholder="1GB SME (30 Days)" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Plan ID</Label>
                    <Input value={manualForm.plan_id} onChange={e => setManualForm(f => ({ ...f, plan_id: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="space-y-2">
                    <Label>Validity</Label>
                    <Input value={manualForm.validity} onChange={e => setManualForm(f => ({ ...f, validity: e.target.value }))} placeholder="30 Days" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cost Price (₦)</Label>
                    <Input type="number" value={manualForm.base_price} onChange={e => setManualForm(f => ({ ...f, base_price: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Selling Price (₦)</Label>
                    <Input type="number" value={manualForm.selling_price} onChange={e => setManualForm(f => ({ ...f, selling_price: e.target.value }))} placeholder="Optional override" />
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
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => bulkAction("enable_smeplug")} disabled={!!isSaving}>
          <Download className="h-3 w-3 mr-1" /> Enable all SMEPlug
        </Button>
        <Button variant="outline" size="sm" onClick={() => bulkAction("enable_subpadi")} disabled={!!isSaving}>
          <Download className="h-3 w-3 mr-1" /> Enable all Subpadi
        </Button>
        <Button variant="outline" size="sm" onClick={() => bulkAction("disable_expensive")} disabled={!!isSaving}>
          <Trash2 className="h-3 w-3 mr-1" /> Disable Expensive Duplicates
        </Button>
        <Button variant="destructive" size="sm" onClick={() => bulkAction("disable_all")} disabled={!!isSaving}>
          <Trash2 className="h-3 w-3 mr-1" /> Disable All Shown
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
                <p><span className="font-medium">Type:</span> {editPlan.plan_type}</p>
                <p><span className="font-medium">Cost Price:</span> ₦{editPlan.base_price.toLocaleString()}</p>
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

      {/* Plans Table(s) */}
      {isLoading ? (
        <div className="glass-card rounded-xl p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      ) : groupByType && Object.keys(groupedPlans).length > 1 ? (
        <div className="space-y-6">
          {PLAN_TYPES.filter(t => groupedPlans[t]?.length > 0).map(type => (
            <Card key={type} className="overflow-hidden">
              <CardHeader className={`py-3 px-4 ${PLAN_TYPE_COLORS[type] || "bg-muted"}`}>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{type} Data Plans</span>
                  <Badge variant="outline">{groupedPlans[type].length} plans</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  {renderPlanTable(groupedPlans[type])}
                </div>
              </CardContent>
            </Card>
          ))}
          {/* Show any ungrouped */}
          {Object.keys(groupedPlans).filter(t => !PLAN_TYPES.includes(t)).map(type => (
            <Card key={type} className="overflow-hidden">
              <CardHeader className="py-3 px-4 bg-muted">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{type} Data Plans</span>
                  <Badge variant="outline">{groupedPlans[type].length} plans</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  {renderPlanTable(groupedPlans[type])}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden overflow-x-auto">
          {renderPlanTable(filteredPlans)}
        </div>
      )}

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

function categorizePlan(planName: string): string {
  const name = planName.toUpperCase();
  if (name.includes('CORPORATE')) return 'CORPORATE';
  if (name.includes('GIFTING') || name.includes('GIFT')) return 'GIFTING';
  if (name.includes('SME')) return 'SME';
  return 'GENERAL';
}

export default AdminDataPlansTab;
