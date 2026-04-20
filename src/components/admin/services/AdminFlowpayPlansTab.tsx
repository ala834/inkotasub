import { useEffect, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, RefreshCw, Database, HeartPulse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const NETWORKS = ["MTN", "AIRTEL", "GLO", "9MOBILE"] as const;
const PLAN_TYPES = ["SME", "GIFTING", "CORPORATE"] as const;

interface FlowpayManualPlan {
  id: string;
  network: string;
  plan_name: string;
  price: number;
  api_plan_id: string | null;
  plan_type: string;
  validity: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

const planSchema = z.object({
  network: z.enum(NETWORKS),
  plan_name: z.string().trim().min(1, "Plan name is required").max(80),
  price: z.coerce.number().min(1, "Price must be greater than 0").max(1_000_000),
  api_plan_id: z.string().trim().max(80).optional(),
  plan_type: z.enum(PLAN_TYPES),
  validity: z.string().trim().max(40).optional(),
  is_enabled: z.boolean(),
});

type PlanFormState = {
  network: typeof NETWORKS[number];
  plan_name: string;
  price: string;
  api_plan_id: string;
  plan_type: typeof PLAN_TYPES[number];
  validity: string;
  is_enabled: boolean;
};

const emptyForm: PlanFormState = {
  network: "MTN",
  plan_name: "",
  price: "",
  api_plan_id: "",
  plan_type: "SME",
  validity: "30 days",
  is_enabled: true,
};

const AdminFlowpayPlansTab = () => {
  const [plans, setPlans] = useState<FlowpayManualPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FlowpayManualPlan | null>(null);
  const [form, setForm] = useState<PlanFormState>(emptyForm);
  const [networkFilter, setNetworkFilter] = useState<string>("all");
  const [healthChecking, setHealthChecking] = useState(false);

  const runHealthCheck = async () => {
    setHealthChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-flowpay-health");
      if (error) throw error;
      const retried = (data as { retried?: number; message?: string })?.retried ?? 0;
      const msg = (data as { message?: string })?.message;
      if (retried > 0) toast.success(`Re-tested ${retried} unstable plan(s). They're visible to users again.`);
      else toast.info(msg || "Nothing to retry — all plans healthy.");
      loadPlans();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Health-check failed");
    } finally {
      setHealthChecking(false);
    }
  };

  const loadPlans = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("flowpay_manual_plans")
      .select("*")
      .order("network")
      .order("plan_type")
      .order("price");
    if (error) toast.error("Failed to load plans");
    else setPlans((data as FlowpayManualPlan[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadPlans(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (plan: FlowpayManualPlan) => {
    setEditing(plan);
    setForm({
      network: (NETWORKS.includes(plan.network as any) ? plan.network : "MTN") as typeof NETWORKS[number],
      plan_name: plan.plan_name,
      price: String(plan.price),
      api_plan_id: plan.api_plan_id || "",
      plan_type: (PLAN_TYPES.includes(plan.plan_type as any) ? plan.plan_type : "SME") as typeof PLAN_TYPES[number],
      validity: plan.validity || "",
      is_enabled: plan.is_enabled,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const parsed = planSchema.safeParse({
      network: form.network,
      plan_name: form.plan_name,
      price: form.price,
      api_plan_id: form.api_plan_id || undefined,
      plan_type: form.plan_type,
      validity: form.validity || undefined,
      is_enabled: form.is_enabled,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    setSaving(true);
    const payload = {
      network: parsed.data.network,
      plan_name: parsed.data.plan_name,
      price: parsed.data.price,
      api_plan_id: parsed.data.api_plan_id || null,
      plan_type: parsed.data.plan_type,
      validity: parsed.data.validity || null,
      is_enabled: parsed.data.is_enabled,
    };
    const { error } = editing
      ? await supabase.from("flowpay_manual_plans").update(payload).eq("id", editing.id)
      : await supabase.from("flowpay_manual_plans").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message || "Failed to save plan");
      return;
    }
    toast.success(editing ? "Plan updated" : "Plan added");
    setDialogOpen(false);
    loadPlans();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("flowpay_manual_plans").delete().eq("id", id);
    if (error) toast.error("Failed to delete plan");
    else {
      toast.success("Plan deleted");
      loadPlans();
    }
  };

  const toggleEnabled = async (plan: FlowpayManualPlan) => {
    const { error } = await supabase
      .from("flowpay_manual_plans")
      .update({ is_enabled: !plan.is_enabled })
      .eq("id", plan.id);
    if (error) toast.error("Failed to update");
    else {
      setPlans(plans.map(p => p.id === plan.id ? { ...p, is_enabled: !p.is_enabled } : p));
    }
  };

  const filtered = networkFilter === "all" ? plans : plans.filter(p => p.network === networkFilter);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Flowpay Plans</CardTitle>
                <CardDescription>
                  Manually managed Flowpay data plans. Runs an automatic health-check every 6 hours
                  to give failing plans a fresh chance — admin-disabled plans are never touched.
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={networkFilter} onValueChange={setNetworkFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All networks</SelectItem>
                  {NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={runHealthCheck} disabled={healthChecking}>
                <HeartPulse className={`h-4 w-4 mr-2 ${healthChecking ? "animate-pulse" : ""}`} />
                Health-check
              </Button>
              <Button variant="outline" size="sm" onClick={loadPlans} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={openAdd}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Plan
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editing ? "Edit Flowpay Plan" : "Add Flowpay Plan"}</DialogTitle>
                    <DialogDescription>
                      Plans are stored in the database and used by the user data purchase page.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label>Network</Label>
                        <Select value={form.network} onValueChange={(v) => setForm({ ...form, network: v as any })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Type</Label>
                        <Select value={form.plan_type} onValueChange={(v) => setForm({ ...form, plan_type: v as any })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PLAN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Plan name</Label>
                      <Input
                        placeholder="e.g. 1GB SME"
                        value={form.plan_name}
                        maxLength={80}
                        onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label>Price (₦)</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          placeholder="500"
                          value={form.price}
                          onChange={(e) => setForm({ ...form, price: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Validity</Label>
                        <Input
                          placeholder="30 days"
                          value={form.validity}
                          maxLength={40}
                          onChange={(e) => setForm({ ...form, validity: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>API plan ID (optional)</Label>
                      <Input
                        placeholder="e.g. SME_1GB"
                        value={form.api_plan_id}
                        maxLength={80}
                        onChange={(e) => setForm({ ...form, api_plan_id: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">Enabled</p>
                        <p className="text-xs text-muted-foreground">Visible to users in the app</p>
                      </div>
                      <Switch
                        checked={form.is_enabled}
                        onCheckedChange={(v) => setForm({ ...form, is_enabled: v })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editing ? "Update" : "Add"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Network</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Validity</TableHead>
                    <TableHead>API ID</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id} className={!p.is_enabled ? "opacity-60" : ""}>
                      <TableCell><Badge variant="outline">{p.network}</Badge></TableCell>
                      <TableCell className="font-medium">{p.plan_name}</TableCell>
                      <TableCell><Badge variant="secondary">{p.plan_type}</Badge></TableCell>
                      <TableCell>₦{Number(p.price).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{p.validity || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">{p.api_plan_id || "—"}</TableCell>
                      <TableCell>
                        <Switch checked={p.is_enabled} onCheckedChange={() => toggleEnabled(p)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete plan?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove "{p.plan_name}" permanently.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(p.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No plans yet. Click "Add Plan" to create your first Flowpay plan.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminFlowpayPlansTab;
