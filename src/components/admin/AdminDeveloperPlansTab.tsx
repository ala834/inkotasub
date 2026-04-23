import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Pencil, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";

type ServiceType = "data" | "airtime" | "cable" | "electricity";
type ProviderSource = "subpadi" | "flowpay" | "smeplug";
type NetworkType = "MTN" | "AIRTEL" | "GLO" | "9MOBILE";

type DeveloperApiPlan = {
  id: string;
  service_type: ServiceType;
  provider_source: ProviderSource;
  network: string | null;
  plan_name: string;
  plan_id: string;
  validation_id: string | null;
  developer_price: number;
  user_price: number;
  reseller_price: number;
  is_enabled: boolean;
  is_hidden_from_users: boolean;
  auto_hide_on_failure: boolean;
  failure_count: number;
  last_failure_reason: string | null;
  sort_order: number;
  updated_at: string;
};

const serviceTypes: ServiceType[] = ["data", "airtime", "cable", "electricity"];
const providers: ProviderSource[] = ["subpadi", "flowpay", "smeplug"];
const networks: NetworkType[] = ["MTN", "AIRTEL", "GLO", "9MOBILE"];

const emptyForm = {
  service_type: "data" as ServiceType,
  provider_source: "subpadi" as ProviderSource,
  network: "MTN",
  plan_name: "",
  plan_id: "",
  validation_id: "",
  developer_price: "",
  user_price: "",
  reseller_price: "",
  sort_order: "0",
  is_enabled: true,
  is_hidden_from_users: false,
  auto_hide_on_failure: true,
};

export default function AdminDeveloperPlansTab() {
  const db = supabase as any;
  const [plans, setPlans] = useState<DeveloperApiPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DeveloperApiPlan | null>(null);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [networkFilter, setNetworkFilter] = useState<string>("all");
  const [form, setForm] = useState(emptyForm);

  const loadPlans = async () => {
    setLoading(true);
    const { data, error } = await db
      .from("developer_api_plans")
      .select("*")
      .order("service_type")
      .order("network")
      .order("sort_order")
      .order("plan_name");

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setPlans(((data as unknown[]) ?? []) as DeveloperApiPlan[]);
    setLoading(false);
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((plan) => {
      if (serviceFilter !== "all" && plan.service_type !== serviceFilter) return false;
      if (providerFilter !== "all" && plan.provider_source !== providerFilter) return false;
      if (networkFilter !== "all" && (plan.network ?? "") !== networkFilter) return false;
      if (!q) return true;

      return [plan.plan_name, plan.plan_id, plan.validation_id ?? "", plan.provider_source, plan.network ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [plans, search, serviceFilter, providerFilter, networkFilter]);

  const failedPlans = useMemo(
    () => plans.filter((plan) => plan.failure_count >= 2 || plan.is_hidden_from_users || !plan.is_enabled),
    [plans],
  );

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (plan: DeveloperApiPlan) => {
    setEditing(plan);
    setForm({
      service_type: plan.service_type,
      provider_source: plan.provider_source,
      network: plan.network ?? "MTN",
      plan_name: plan.plan_name,
      plan_id: plan.plan_id,
      validation_id: plan.validation_id ?? "",
      developer_price: String(plan.developer_price),
      user_price: String(plan.user_price),
      reseller_price: String(plan.reseller_price),
      sort_order: String(plan.sort_order ?? 0),
      is_enabled: plan.is_enabled,
      is_hidden_from_users: plan.is_hidden_from_users,
      auto_hide_on_failure: plan.auto_hide_on_failure,
    });
    setOpen(true);
  };

  const savePlan = async () => {
    if (!form.plan_name.trim() || !form.plan_id.trim()) {
      toast.error("Plan name and plan ID are required");
      return;
    }

    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const payload = {
      service_type: form.service_type,
      provider_source: form.provider_source,
      network: form.service_type === "airtime" ? (form.network || null) : form.network,
      plan_name: form.plan_name.trim(),
      plan_id: form.plan_id.trim(),
      validation_id: form.validation_id.trim() || null,
      developer_price: Number(form.developer_price || 0),
      user_price: Number(form.user_price || 0),
      reseller_price: Number(form.reseller_price || 0),
      sort_order: Number(form.sort_order || 0),
      is_enabled: form.is_enabled,
      is_hidden_from_users: form.is_hidden_from_users,
      auto_hide_on_failure: form.auto_hide_on_failure,
      updated_by: auth.user?.id ?? null,
      ...(editing ? {} : { created_by: auth.user?.id ?? null }),
    };

    const query = editing
      ? db.from("developer_api_plans").update(payload).eq("id", editing.id)
      : db.from("developer_api_plans").insert(payload);

    const { error } = await query;
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(editing ? "Plan updated" : "Plan created");
    setOpen(false);
    resetForm();
    loadPlans();
  };

  const deletePlan = async (id: string) => {
    if (!confirm("Delete this developer API plan?")) return;
    const { error } = await db.from("developer_api_plans").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plan deleted");
    loadPlans();
  };

  const restorePlan = async (plan: DeveloperApiPlan) => {
    const { error } = await db
      .from("developer_api_plans")
      .update({
        failure_count: 0,
        last_failure_reason: null,
        is_hidden_from_users: false,
        is_enabled: true,
      })
      .eq("id", plan.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Plan restored");
    loadPlans();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-xl font-semibold">Developer Plans Management</h3>
          <p className="text-sm text-muted-foreground">Manage the API catalog, pricing tiers, provider sources, and failed-plan visibility.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadPlans} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Plan</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit developer API plan" : "Add developer API plan"}</DialogTitle>
                <DialogDescription>Define provider mapping, plan identifiers, pricing, and visibility rules.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Service Type</Label>
                  <Select value={form.service_type} onValueChange={(value: ServiceType) => setForm((prev) => ({ ...prev, service_type: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{serviceTypes.map((type) => <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Provider Source</Label>
                  <Select value={form.provider_source} onValueChange={(value: ProviderSource) => setForm((prev) => ({ ...prev, provider_source: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{providers.map((provider) => <SelectItem key={provider} value={provider} className="uppercase">{provider}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Network</Label>
                  <Select value={form.network} onValueChange={(value) => setForm((prev) => ({ ...prev, network: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{networks.map((network) => <SelectItem key={network} value={network}>{network}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input type="number" value={form.sort_order} onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Plan Name</Label>
                  <Input value={form.plan_name} onChange={(e) => setForm((prev) => ({ ...prev, plan_name: e.target.value }))} placeholder="1GB SME / GOtv Jolli / EKEDC Token" />
                </div>
                <div className="space-y-2">
                  <Label>Plan ID</Label>
                  <Input value={form.plan_id} onChange={(e) => setForm((prev) => ({ ...prev, plan_id: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Validation ID</Label>
                  <Input value={form.validation_id} onChange={(e) => setForm((prev) => ({ ...prev, validation_id: e.target.value }))} placeholder="Provider plan code or validation slug" />
                </div>
                <div className="space-y-2">
                  <Label>Developer Price</Label>
                  <Input type="number" min="0" step="0.01" value={form.developer_price} onChange={(e) => setForm((prev) => ({ ...prev, developer_price: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>User Price</Label>
                  <Input type="number" min="0" step="0.01" value={form.user_price} onChange={(e) => setForm((prev) => ({ ...prev, user_price: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Reseller Price</Label>
                  <Input type="number" min="0" step="0.01" value={form.reseller_price} onChange={(e) => setForm((prev) => ({ ...prev, reseller_price: e.target.value }))} />
                </div>
                <div className="space-y-3 sm:col-span-2 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Enabled</p>
                      <p className="text-xs text-muted-foreground">Visible to developer catalog when not hidden.</p>
                    </div>
                    <Switch checked={form.is_enabled} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_enabled: checked }))} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Hidden from developers</p>
                      <p className="text-xs text-muted-foreground">Keeps the plan in admin review only.</p>
                    </div>
                    <Switch checked={form.is_hidden_from_users} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_hidden_from_users: checked }))} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Auto-hide after repeated failure</p>
                      <p className="text-xs text-muted-foreground">Automatically moves unstable plans out of developer-facing views.</p>
                    </div>
                    <Switch checked={form.auto_hide_on_failure} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, auto_hide_on_failure: checked }))} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={savePlan} disabled={saving}>{saving ? "Saving..." : editing ? "Save Changes" : "Create Plan"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Plans</p><p className="text-2xl font-bold">{plans.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Active</p><p className="text-2xl font-bold">{plans.filter((plan) => plan.is_enabled && !plan.is_hidden_from_users).length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Hidden / Failed</p><p className="text-2xl font-bold">{failedPlans.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Auto-Hide Enabled</p><p className="text-2xl font-bold">{plans.filter((plan) => plan.auto_hide_on_failure).length}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="catalog" className="space-y-4">
        <TabsList>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="failed">Failed Plans</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Catalog Filters</CardTitle>
              <CardDescription>Filter by service type, provider, network, or search across plan names and IDs.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <Input placeholder="Search plans" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select value={serviceFilter} onValueChange={setServiceFilter}>
                <SelectTrigger><SelectValue placeholder="Service" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All services</SelectItem>
                  {serviceTypes.map((type) => <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger><SelectValue placeholder="Provider" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  {providers.map((provider) => <SelectItem key={provider} value={provider} className="uppercase">{provider}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={networkFilter} onValueChange={setNetworkFilter}>
                <SelectTrigger><SelectValue placeholder="Network" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All networks</SelectItem>
                  {networks.map((network) => <SelectItem key={network} value={network}>{network}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Developer API Catalog</CardTitle>
              <CardDescription>Admin-managed plans used by the developer dashboard and API documentation layer.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Network</TableHead>
                    <TableHead>Plan ID</TableHead>
                    <TableHead>Validation ID</TableHead>
                    <TableHead>Developer</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Reseller</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPlans.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No plans found.</TableCell></TableRow>
                  ) : filteredPlans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell><Badge variant="outline" className="capitalize">{plan.service_type}</Badge></TableCell>
                      <TableCell>
                        <div className="font-medium">{plan.plan_name}</div>
                        <div className="text-xs text-muted-foreground">Sort #{plan.sort_order}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="uppercase">{plan.provider_source}</Badge></TableCell>
                      <TableCell>{plan.network ?? "—"}</TableCell>
                      <TableCell><code className="text-xs">{plan.plan_id}</code></TableCell>
                      <TableCell><code className="text-xs">{plan.validation_id ?? "—"}</code></TableCell>
                      <TableCell>₦{Number(plan.developer_price).toLocaleString()}</TableCell>
                      <TableCell>₦{Number(plan.user_price).toLocaleString()}</TableCell>
                      <TableCell>₦{Number(plan.reseller_price).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={plan.is_enabled ? "secondary" : "destructive"}>{plan.is_enabled ? "Enabled" : "Disabled"}</Badge>
                          {plan.is_hidden_from_users && <Badge variant="outline">Hidden</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(plan)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => deletePlan(plan.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Failed Plans Review</CardTitle>
              <CardDescription>Repeatedly failing plans stay visible here for review while hidden from developers and users.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Failures</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedPlans.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No failed plans in review.</TableCell></TableRow>
                  ) : failedPlans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <div className="font-medium">{plan.plan_name}</div>
                        <div className="text-xs text-muted-foreground">{plan.network ?? "—"} • {plan.plan_id}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{plan.service_type}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="uppercase">{plan.provider_source}</Badge></TableCell>
                      <TableCell>{plan.failure_count}</TableCell>
                      <TableCell className="max-w-[280px] truncate" title={plan.last_failure_reason ?? ""}>{plan.last_failure_reason ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {!plan.is_enabled && <Badge variant="destructive">Disabled</Badge>}
                          {plan.is_hidden_from_users && <Badge variant="outline">Hidden</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => restorePlan(plan)}>Restore</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}