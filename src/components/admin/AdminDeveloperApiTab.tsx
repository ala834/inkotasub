import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, Key, Activity, Wallet, ArrowDownCircle, ArrowUpCircle, Layers3 } from "lucide-react";

type Request = { id: string; user_id: string; business_name: string | null; reason: string | null; status: string; created_at: string; rejection_reason: string | null };
type ApiKeyRow = { id: string; user_id: string; name: string; key_prefix: string; is_revoked: boolean; last_used_at: string | null; created_at: string };
type WalletLedgerRow = { id: string; user_id: string; amount: number; entry_type: string; reference: string | null; created_at: string; metadata: Record<string, any> | null };
type DeveloperPlanRow = { id: string; service_type: string; provider_source: string; network: string | null; plan_name: string; plan_id: string; is_enabled: boolean; is_hidden_from_users: boolean; failure_count: number };
type ProfileLite = { user_id: string; full_name: string | null; username: string | null };

const AdminDeveloperApiTab = () => {
  const db = supabase as any;
  const [tab, setTab] = useState("requests");
  const [requests, setRequests] = useState<Request[]>([]);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);
  const [developerPlans, setDeveloperPlans] = useState<DeveloperPlanRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [stats, setStats] = useState({ total: 0, success: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const walletStats = useMemo(() => {
    return ledger.reduce(
      (acc, row) => {
        if (row.entry_type === "credit") acc.funded += Number(row.amount ?? 0);
        if (row.entry_type === "debit") acc.deducted += Number(row.amount ?? 0);
        return acc;
      },
      { funded: 0, deducted: 0 },
    );
  }, [ledger]);

  const load = async () => {
    setLoading(true);
    const [{ data: reqs }, { data: ks }, { data: logs }, { data: ledgerRows }, { data: planRows }] = await Promise.all([
      supabase.from("api_access_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("api_keys").select("*").order("created_at", { ascending: false }),
      supabase.from("api_request_logs").select("success").gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
      supabase.from("api_wallet_ledger").select("id, user_id, amount, entry_type, reference, created_at").order("created_at", { ascending: false }).limit(50),
      db.from("developer_api_plans").select("id, service_type, provider_source, network, plan_name, plan_id, is_enabled, is_hidden_from_users, failure_count").order("service_type").order("network").order("plan_name"),
    ]);
    setRequests((reqs as Request[]) ?? []);
    setKeys((ks as ApiKeyRow[]) ?? []);
    setLedger((ledgerRows as WalletLedgerRow[]) ?? []);
    setDeveloperPlans((planRows as DeveloperPlanRow[]) ?? []);
    const total = logs?.length ?? 0;
    const success = logs?.filter((l: any) => l.success).length ?? 0;
    setStats({ total, success, failed: total - success });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const approve = async (req: Request) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("api_access_requests").update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq("id", req.id);
    if (error) { toast.error(error.message); return; }
    // Ensure API wallet exists
    await supabase.from("api_wallets").upsert({ user_id: req.user_id, balance: 0 }, { onConflict: "user_id", ignoreDuplicates: true });
    toast.success("Request approved");
    load();
  };

  const deny = async (req: Request) => {
    const reason = rejectReason[req.id] || "Request denied";
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("api_access_requests").update({ status: "denied", reviewed_by: user?.id, reviewed_at: new Date().toISOString(), rejection_reason: reason }).eq("id", req.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Request denied");
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this key?")) return;
    const { error } = await supabase.from("api_keys").update({ is_revoked: true, revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Key revoked");
    load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Developer API</h2>
        <p className="text-muted-foreground text-sm">Approve access requests, monitor keys, and view API usage.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">API calls (7d)</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Success</p><p className="text-2xl font-bold text-green-600">{stats.success}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Failed</p><p className="text-2xl font-bold text-destructive">{stats.failed}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-6 flex items-center gap-3"><Wallet className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Funded</p><p className="text-xl font-bold">₦{walletStats.funded.toLocaleString()}</p></div></CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3"><ArrowDownCircle className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Deducted</p><p className="text-xl font-bold">₦{walletStats.deducted.toLocaleString()}</p></div></CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3"><Layers3 className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Developer Plans</p><p className="text-xl font-bold">{developerPlans.length}</p></div></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="requests" className="gap-2"><Clock className="h-4 w-4" />Requests</TabsTrigger>
          <TabsTrigger value="keys" className="gap-2"><Key className="h-4 w-4" />All Keys</TabsTrigger>
          <TabsTrigger value="wallet" className="gap-2"><ArrowUpCircle className="h-4 w-4" />Wallet</TabsTrigger>
          <TabsTrigger value="plans" className="gap-2"><Layers3 className="h-4 w-4" />Plans</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!loading && requests.length === 0 && <p className="text-sm text-muted-foreground">No requests.</p>}
          {requests.map(r => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-base">{r.business_name ?? "Unnamed"}</CardTitle>
                    <p className="text-xs text-muted-foreground">User: {r.user_id.slice(0, 8)}... · {new Date(r.created_at).toLocaleString()}</p>
                  </div>
                  <Badge variant={r.status === "approved" ? "default" : r.status === "denied" ? "destructive" : "secondary"}>
                    {r.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">{r.reason}</p>
                {r.status === "denied" && r.rejection_reason && <p className="text-xs text-destructive">Reason: {r.rejection_reason}</p>}
                {r.status === "pending" && (
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={() => approve(r)} className="gap-1"><CheckCircle2 className="h-4 w-4" />Approve</Button>
                    <Input
                      placeholder="Reason for denial"
                      value={rejectReason[r.id] ?? ""}
                      onChange={e => setRejectReason({ ...rejectReason, [r.id]: e.target.value })}
                      className="max-w-xs"
                    />
                    <Button size="sm" variant="destructive" onClick={() => deny(r)} className="gap-1"><XCircle className="h-4 w-4" />Deny</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="keys" className="space-y-2">
          {keys.length === 0 && <p className="text-sm text-muted-foreground">No keys.</p>}
          {keys.map(k => (
            <Card key={k.id}>
              <CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{k.name}</span>
                    {k.is_revoked ? <Badge variant="destructive">Revoked</Badge> : <Badge className="bg-green-600">Active</Badge>}
                  </div>
                  <code className="text-xs text-muted-foreground">{k.key_prefix}••••</code>
                  <p className="text-xs text-muted-foreground">User {k.user_id.slice(0, 8)}... · Last used {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</p>
                </div>
                {!k.is_revoked && <Button size="sm" variant="destructive" onClick={() => revoke(k.id)}>Revoke</Button>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="wallet" className="space-y-2">
          {ledger.length === 0 && <p className="text-sm text-muted-foreground">No wallet transactions yet.</p>}
          {ledger.map((row) => (
            <Card key={row.id}>
              <CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={row.entry_type === "credit" ? "secondary" : "outline"}>{row.entry_type}</Badge>
                    <span className="font-medium">₦{Number(row.amount).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">User {row.user_id.slice(0, 8)}... · {row.reference ?? "No reference"}</p>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="plans" className="space-y-2">
          {developerPlans.length === 0 && <p className="text-sm text-muted-foreground">No developer plans yet.</p>}
          {developerPlans.map((plan) => (
            <Card key={plan.id}>
              <CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{plan.plan_name}</span>
                    <Badge variant="outline" className="uppercase">{plan.provider_source}</Badge>
                    <Badge variant="outline" className="capitalize">{plan.service_type}</Badge>
                    {!plan.is_enabled && <Badge variant="destructive">Disabled</Badge>}
                    {plan.is_hidden_from_users && <Badge variant="secondary">Hidden</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{plan.network ?? "—"} · {plan.plan_id}</p>
                </div>
                <Badge variant={plan.failure_count >= 2 ? "destructive" : "outline"}>Failures: {plan.failure_count}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDeveloperApiTab;
