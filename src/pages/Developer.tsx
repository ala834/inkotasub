import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  BookOpen,
  CheckCircle2,
  Code,
  Copy,
  CreditCard,
  Database,
  Key,
  Layers3,
  Loader2,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type AccessRequest = { id: string; status: string; reason: string | null; business_name: string | null; rejection_reason: string | null; created_at: string };
type ApiKey = { id: string; name: string; key_prefix: string; is_revoked: boolean; last_used_at: string | null; created_at: string; rate_limit_per_min: number };
type ApiWallet = { balance: number };
type ApiLog = { id: string; endpoint: string; method: string; status_code: number; success: boolean; response_time_ms: number | null; created_at: string };
type WalletLedgerRow = { id: string; amount: number; entry_type: string; reference: string | null; created_at: string; metadata: Record<string, unknown> | null };
type DeveloperPlan = {
  id: string;
  service_type: string;
  provider_source: string;
  network: string | null;
  plan_name: string;
  plan_id: string;
  validation_id: string | null;
  developer_price: number;
  user_price: number;
  reseller_price: number;
  is_enabled: boolean;
  failure_count: number;
  is_hidden_from_users: boolean;
};

const NETWORKS = ["ALL", "MTN", "GLO", "AIRTEL", "9MOBILE"] as const;
const SERVICES = ["all", "data", "airtime", "cable", "electricity"] as const;
const AIRTIME_MIN = 50;
const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/developer-api`;

const Developer = () => {
  const db = supabase as any;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accessRequest, setAccessRequest] = useState<AccessRequest | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [wallet, setWallet] = useState<ApiWallet>({ balance: 0 });
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [walletHistory, setWalletHistory] = useState<WalletLedgerRow[]>([]);
  const [reason, setReason] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [plans, setPlans] = useState<DeveloperPlan[]>([]);
  const [planSearch, setPlanSearch] = useState("");
  const [networkFilter, setNetworkFilter] = useState<string>("ALL");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [fundOpen, setFundOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [fundLoading, setFundLoading] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const isApproved = accessRequest?.status === "approved";

  const stats = useMemo(() => {
    const total = logs.length;
    const success = logs.filter((l) => l.success).length;
    return { total, success, failed: total - success };
  }, [logs]);

  const walletStats = useMemo(() => {
    return walletHistory.reduce(
      (acc, row) => {
        if (row.entry_type === "credit") acc.funded += Number(row.amount ?? 0);
        if (row.entry_type === "debit") acc.deducted += Number(row.amount ?? 0);
        return acc;
      },
      { funded: 0, deducted: 0 },
    );
  }, [walletHistory]);

  const filteredPlans = useMemo(() => {
    const q = planSearch.trim().toLowerCase();
    return plans.filter((plan) => {
      if (serviceFilter !== "all" && plan.service_type !== serviceFilter) return false;
      if (networkFilter !== "ALL" && (plan.network ?? "") !== networkFilter) return false;
      if (!q) return true;
      return [
        plan.plan_name,
        plan.plan_id,
        plan.validation_id ?? "",
        plan.provider_source,
        plan.network ?? "",
        plan.service_type,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [plans, planSearch, networkFilter, serviceFilter]);

  const planGroups = useMemo(() => {
    return filteredPlans.reduce<Record<string, DeveloperPlan[]>>((acc, plan) => {
      const key = plan.service_type;
      (acc[key] ||= []).push(plan);
      return acc;
    }, {});
  }, [filteredPlans]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: req }, { data: ks }, { data: w }, { data: ls }, { data: ledgerRows }, { data: planRows }] = await Promise.all([
      supabase.from("api_access_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("api_keys").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("api_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("api_request_logs").select("id, endpoint, method, status_code, success, response_time_ms, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("api_wallet_ledger").select("id, amount, entry_type, reference, created_at, metadata").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      db.from("developer_api_plans").select("id, service_type, provider_source, network, plan_name, plan_id, validation_id, developer_price, user_price, reseller_price, is_enabled, failure_count, is_hidden_from_users").order("service_type").order("network").order("sort_order").order("plan_name"),
    ]);

    setAccessRequest((req as AccessRequest | null) ?? null);
    setKeys((ks as ApiKey[]) ?? []);
    setWallet({ balance: Number(w?.balance ?? 0) });
    setLogs((ls as ApiLog[]) ?? []);
    setWalletHistory((ledgerRows as WalletLedgerRow[]) ?? []);
    setPlans(((planRows as DeveloperPlan[]) ?? []).filter((plan) => plan.is_enabled && !plan.is_hidden_from_users));
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  // Auto-verify Paystack payment on return (?api_wallet_ref=...)
  useEffect(() => {
    const ref = searchParams.get("api_wallet_ref");
    if (!ref || !user || verifyingPayment) return;
    (async () => {
      setVerifyingPayment(true);
      try {
        const { data, error } = await supabase.functions.invoke("verify-api-wallet-payment", {
          body: { reference: ref },
        });
        if (error) throw error;
        if (data?.status === "success") {
          toast.success(`Developer Wallet funded with ₦${Number(data.amount).toLocaleString()}`);
          await loadData();
        } else {
          toast.error(data?.message ?? "Payment verification failed");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Could not verify payment");
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete("api_wallet_ref");
        setSearchParams(next, { replace: true });
        setVerifyingPayment(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.id]);

  const fundWallet = async () => {
    const amt = parseFloat(fundAmount || "0");
    if (!user) return;
    if (!amt || amt < 100) {
      toast.error("Minimum funding amount is ₦100");
      return;
    }
    setFundLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("initialize-api-wallet-payment", {
        body: { amount: amt, email: user.email },
      });
      if (error) throw error;
      if (data?.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        throw new Error(data?.error ?? "Failed to initialize payment");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start payment");
    } finally {
      setFundLoading(false);
    }
  };

  const requestAccess = async () => {
    if (!businessName.trim() || !reason.trim()) {
      toast.error("Please fill in both fields");
      return;
    }
    setRequesting(true);
    const { error } = await supabase.from("api_access_requests").insert({
      user_id: user!.id,
      business_name: businessName.trim(),
      reason: reason.trim(),
    });
    setRequesting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Access request submitted. An admin will review it shortly.");
    setReason("");
    setBusinessName("");
    loadData();
  };

  const generateKey = async () => {
    if (!keyName.trim()) {
      toast.error("Enter a key name");
      return;
    }
    setCreatingKey(true);
    const { data, error } = await supabase.functions.invoke("generate-api-key", { body: { name: keyName.trim() } });
    setCreatingKey(false);
    if (error || !data?.success) {
      toast.error(data?.error ?? error?.message ?? "Failed to create key");
      return;
    }
    setNewKey(data.key);
    setKeyName("");
    loadData();
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Revoke this key? This cannot be undone.")) return;
    const { error } = await supabase.from("api_keys").update({ is_revoked: true, revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Key revoked");
    loadData();
  };

  const copy = async (text: string, label = "Copied") => {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero pb-12">
      <header className="sticky top-0 z-40 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
              <Code className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg">Developer API</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
        {!accessRequest && (
          <Card>
            <CardHeader>
              <CardTitle>Request API Access</CardTitle>
              <CardDescription>Tell us about your project. An admin will review your request.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="biz">Business / Project Name</Label>
                <Input id="biz" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. AcmeRecharge Ltd" maxLength={100} />
              </div>
              <div>
                <Label htmlFor="reason">What will you build?</Label>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe your use case..." rows={4} maxLength={500} />
              </div>
              <Button onClick={requestAccess} disabled={requesting} className="w-full">
                {requesting ? "Submitting..." : "Submit Request"}
              </Button>
            </CardContent>
          </Card>
        )}

        {accessRequest && accessRequest.status === "pending" && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Request pending review</AlertTitle>
            <AlertDescription>Your API access request is being reviewed by an admin. You'll be notified once approved.</AlertDescription>
          </Alert>
        )}

        {accessRequest && accessRequest.status === "denied" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Request denied</AlertTitle>
            <AlertDescription>{accessRequest.rejection_reason ?? "Please contact support for details."}</AlertDescription>
          </Alert>
        )}

        {isApproved && (
          <Tabs defaultValue="keys" className="space-y-4">
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="keys" className="gap-1 px-2"><Key className="h-4 w-4" /><span className="hidden sm:inline">Keys</span></TabsTrigger>
              <TabsTrigger value="services" className="gap-1 px-2"><Layers3 className="h-4 w-4" /><span className="hidden sm:inline">Services</span></TabsTrigger>
              <TabsTrigger value="usage" className="gap-1 px-2"><Activity className="h-4 w-4" /><span className="hidden sm:inline">Usage</span></TabsTrigger>
              <TabsTrigger value="wallet" className="gap-1 px-2"><Wallet className="h-4 w-4" /><span className="hidden sm:inline">Wallet</span></TabsTrigger>
              <TabsTrigger value="docs" className="gap-1 px-2"><BookOpen className="h-4 w-4" /><span className="hidden sm:inline">Docs</span></TabsTrigger>
            </TabsList>

            <TabsContent value="keys" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Create new key</CardTitle>
                  <CardDescription>Keys are shown once. Save them securely.</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="e.g. Production server" maxLength={50} />
                  <Button onClick={generateKey} disabled={creatingKey} className="gap-2">
                    <Code className="h-4 w-4" /> Generate
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">Your API Keys</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {keys.length === 0 && <p className="text-sm text-muted-foreground">No keys yet.</p>}
                  {keys.map((k) => (
                    <div key={k.id} className="flex items-center justify-between p-3 rounded-lg border bg-card gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{k.name}</span>
                          <Badge variant={k.is_revoked ? "destructive" : "secondary"}>{k.is_revoked ? "Revoked" : "Active"}</Badge>
                          <Badge variant="outline">{k.rate_limit_per_min}/min</Badge>
                        </div>
                        <code className="text-xs text-muted-foreground">{k.key_prefix}••••••••••••</code>
                        <p className="text-xs text-muted-foreground mt-1">{k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString()}` : "Never used"}</p>
                      </div>
                      {!k.is_revoked && <Button size="sm" variant="outline" onClick={() => revokeKey(k.id)}>Revoke</Button>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="services" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Available API Plans</p><p className="text-2xl font-bold">{plans.length}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Data</p><p className="text-2xl font-bold">{plans.filter((plan) => plan.service_type === "data").length}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Airtime</p><p className="text-2xl font-bold">{plans.filter((plan) => plan.service_type === "airtime").length}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Hidden failed plans removed</p><p className="text-2xl font-bold">{plans.filter((plan) => plan.failure_count > 0).length}</p></CardContent></Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Developer API Service Catalog</CardTitle>
                  <CardDescription>Live plans managed from the admin dashboard, including provider routing metadata and developer pricing.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col lg:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search by service, plan name, plan ID, validation ID..." value={planSearch} onChange={(e) => setPlanSearch(e.target.value)} className="pl-9" />
                    </div>
                    <Select value={serviceFilter} onValueChange={setServiceFilter}>
                      <SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="Service" /></SelectTrigger>
                      <SelectContent>
                        {SERVICES.map((service) => <SelectItem key={service} value={service} className="capitalize">{service === "all" ? "All services" : service}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={networkFilter} onValueChange={setNetworkFilter}>
                      <SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="Network" /></SelectTrigger>
                      <SelectContent>
                        {NETWORKS.map((network) => <SelectItem key={network} value={network}>{network === "ALL" ? "All networks" : network}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {Object.keys(planGroups).length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No plans match your filters.</p>
                  ) : (
                    Object.entries(planGroups).map(([service, servicePlans]) => (
                      <div key={service} className="rounded-lg border overflow-hidden">
                        <div className="px-4 py-3 bg-muted/40 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {service === "airtime" ? <Phone className="h-4 w-4 text-primary" /> : <Database className="h-4 w-4 text-primary" />}
                            <span className="font-semibold capitalize">{service}</span>
                          </div>
                          <Badge variant="outline">{servicePlans.length} plans</Badge>
                        </div>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Service Name</TableHead>
                                <TableHead>Provider</TableHead>
                                <TableHead>Network</TableHead>
                                <TableHead>Plan ID</TableHead>
                                <TableHead>Validation ID</TableHead>
                                <TableHead>Developer Price</TableHead>
                                <TableHead>User Price</TableHead>
                                <TableHead>Reseller Price</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {servicePlans.map((plan) => (
                                <TableRow key={plan.id}>
                                  <TableCell className="font-medium">{plan.plan_name}</TableCell>
                                  <TableCell><Badge variant="outline" className="uppercase">{plan.provider_source}</Badge></TableCell>
                                  <TableCell>{plan.network ?? "—"}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{plan.plan_id}</code>
                                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(plan.plan_id, `Plan ID ${plan.plan_id} copied`)}>
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell><code className="text-xs">{plan.validation_id ?? "—"}</code></TableCell>
                                  <TableCell>₦{Number(plan.developer_price).toLocaleString()}</TableCell>
                                  <TableCell>₦{Number(plan.user_price).toLocaleString()}</TableCell>
                                  <TableCell>₦{Number(plan.reseller_price).toLocaleString()}</TableCell>
                                  <TableCell>
                                    <Badge variant={plan.is_enabled ? "secondary" : "destructive"}>{plan.is_enabled ? "Active" : "Disabled"}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="usage" className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total calls</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Successful</p><p className="text-2xl font-bold">{stats.success}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Failed</p><p className="text-2xl font-bold">{stats.failed}</p></CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle className="text-lg">Recent requests</CardTitle></CardHeader>
                <CardContent className="space-y-1 max-h-[500px] overflow-y-auto">
                  {logs.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {log.success ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> : <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />}
                        <Badge variant="outline" className="font-mono text-[10px]">{log.method}</Badge>
                        <code className="text-xs truncate">{log.endpoint}</code>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span>{log.status_code}</span>
                        <span>{log.response_time_ms ?? 0}ms</span>
                        <span className="hidden sm:inline">{new Date(log.created_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="wallet" className="space-y-4">
              {/* Hero card with Fund Wallet CTA */}
              <Card className="overflow-hidden border-0 bg-gradient-to-br from-green-600 via-emerald-600 to-teal-600 text-white shadow-xl">
                <CardContent className="pt-6 pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/80">Developer Wallet Balance</p>
                    <p className="text-4xl font-bold mt-1">₦{wallet.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-white/80 mt-2">Used to pay for API calls. Charges are deducted automatically.</p>
                  </div>
                  <Button
                    size="lg"
                    onClick={() => { setFundAmount(""); setFundOpen(true); }}
                    disabled={verifyingPayment}
                    className="bg-white text-green-700 hover:bg-white/90 font-bold gap-2 shadow-lg"
                  >
                    {verifyingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {verifyingPayment ? "Verifying…" : "Fund Wallet"}
                  </Button>
                </CardContent>
              </Card>

              <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
                <Card><CardContent className="pt-6 flex items-center gap-3"><ArrowDownCircle className="h-5 w-5 text-green-600" /><div><p className="text-xs text-muted-foreground">Total Funded</p><p className="text-xl font-bold">₦{walletStats.funded.toLocaleString()}</p></div></CardContent></Card>
                <Card><CardContent className="pt-6 flex items-center gap-3"><ArrowUpCircle className="h-5 w-5 text-destructive" /><div><p className="text-xs text-muted-foreground">Total Deducted</p><p className="text-xl font-bold">₦{walletStats.deducted.toLocaleString()}</p></div></CardContent></Card>
                <Card><CardContent className="pt-6 flex items-center gap-3"><Activity className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Transactions</p><p className="text-xl font-bold">{walletHistory.length}</p></div></CardContent></Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Wallet History</CardTitle>
                  <CardDescription>Funding deposits and per-call API charges.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {walletHistory.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No wallet transactions yet.</p>}
                  {walletHistory.map((row) => {
                    const meta = (row.metadata ?? {}) as Record<string, any>;
                    const service = meta.service_type ? String(meta.service_type) : meta.type === "paystack_funding" ? "Paystack funding" : null;
                    const channel = meta.channel ? String(meta.channel) : null;
                    const isCredit = row.entry_type === "credit";
                    return (
                      <div key={row.id} className="flex items-start justify-between rounded-lg border p-3 gap-3 flex-wrap">
                        <div className="min-w-0 flex items-start gap-3">
                          <div className={`mt-0.5 h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${isCredit ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {isCredit ? <ArrowDownCircle className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={isCredit ? "secondary" : "outline"}>{isCredit ? "Funded" : "Deducted"}</Badge>
                              <span className="font-semibold">₦{Number(row.amount).toLocaleString()}</span>
                              {service && <Badge variant="outline" className="capitalize text-[10px]">{service}</Badge>}
                              {channel && <Badge variant="outline" className="capitalize text-[10px]">{channel}</Badge>}
                              <Badge variant="secondary" className="bg-green-100 text-green-700 text-[10px]">Success</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 break-all">Ref: {row.reference ?? "—"}</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground shrink-0">{new Date(row.created_at).toLocaleString()}</p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>


            <TabsContent value="docs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Base URL</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between bg-muted p-3 rounded-lg gap-2">
                    <code className="text-xs sm:text-sm break-all">{API_BASE}</code>
                    <Button size="icon" variant="ghost" onClick={() => copy(API_BASE, "Base URL copied")}><Copy className="h-4 w-4" /></Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">Send your key in the <code className="bg-muted px-1 rounded">Authorization: Bearer YOUR_KEY</code> header on every request.</p>
                </CardContent>
              </Card>

              <EndpointDoc
                method="GET"
                path="/balance"
                desc="Get developer wallet balance and summary"
                onCopy={copy}
                exampleReq={`curl ${API_BASE}/balance \\\n  -H "Authorization: Bearer ink_live_xxx"`}
                exampleRes={`{ "success": true, "balance": 5000, "currency": "NGN", "funded": 10000, "deducted": 5000 }`}
              />
              <EndpointDoc
                method="GET"
                path="/service-plans?service_type=data&network=mtn"
                desc="List admin-managed developer plans with provider, validation ID, and developer pricing"
                onCopy={copy}
                exampleReq={`curl "${API_BASE}/service-plans?service_type=data&network=mtn" \\\n  -H "Authorization: Bearer ink_live_xxx"`}
                exampleRes={`{\n  "success": true,\n  "count": 2,\n  "plans": [\n    {\n      "service_type": "data",\n      "provider_source": "subpadi",\n      "network": "MTN",\n      "plan_name": "1GB SME",\n      "plan_id": "MTN-1GB-SME",\n      "validation_id": "sp-102",\n      "developer_price": 500,\n      "api_status": "active"\n    }\n  ]\n}`}
              />
              <EndpointDoc
                method="POST"
                path="/buy-airtime"
                desc="Purchase airtime with automatic 9mobile provider failover"
                onCopy={copy}
                exampleReq={`curl -X POST ${API_BASE}/buy-airtime \\\n  -H "Authorization: Bearer ink_live_xxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{"network":"mtn","phone":"2348031234567","amount":100}'`}
                exampleRes={`{ "success": true, "reference": "api_air_...", "amount": 100, "provider": "subpadi" }`}
              />
              <EndpointDoc
                method="POST"
                path="/buy-data"
                desc="Purchase a data bundle using admin-managed developer plan routing"
                onCopy={copy}
                exampleReq={`curl -X POST ${API_BASE}/buy-data \\\n  -H "Authorization: Bearer ink_live_xxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{"network":"airtel","phone":"2348031234567","plan_id":"AIRTEL-1GB-SME"}'`}
                exampleRes={`{ "success": true, "reference": "api_data_...", "plan_id": "AIRTEL-1GB-SME", "amount": 500 }`}
              />

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Validation Rules</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex gap-3"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /><div><p className="font-medium">Phone format</p><p className="text-xs text-muted-foreground">Phone numbers must start with <code className="bg-muted px-1 rounded">234</code>. Local numbers are normalized automatically.</p></div></div>
                  <div className="flex gap-3"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /><div><p className="font-medium">Allowed networks</p><p className="text-xs text-muted-foreground">Only MTN, GLO, Airtel, and 9mobile are accepted for airtime/data requests.</p></div></div>
                  <div className="flex gap-3"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" /><div><p className="font-medium">Minimum amount</p><p className="text-xs text-muted-foreground">Airtime minimum is ₦{AIRTIME_MIN}. Data price is pulled from the admin-managed plan catalog.</p></div></div>
                  <div className="flex gap-3"><ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" /><div><p className="font-medium">Failed plans</p><p className="text-xs text-muted-foreground">Repeatedly failing plans are hidden from the public developer catalog and kept in admin review only.</p></div></div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>

      <Dialog open={!!newKey} onOpenChange={(open) => { if (!open) setNewKey(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your API key</DialogTitle>
            <DialogDescription>This key will not be shown again. Copy and store it securely.</DialogDescription>
          </DialogHeader>
          <div className="bg-muted p-3 rounded-lg break-all font-mono text-sm">{newKey}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => copy(newKey ?? "", "Key copied")}><Copy className="h-4 w-4 mr-2" />Copy</Button>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const EndpointDoc = ({ method, path, desc, exampleReq, exampleRes, onCopy }: { method: string; path: string; desc: string; exampleReq: string; exampleRes: string; onCopy: (t: string, l?: string) => void }) => (
  <Card>
    <CardHeader>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={method === "GET" ? "secondary" : "default"} className="font-mono">{method}</Badge>
        <code className="text-sm font-medium">{path}</code>
      </div>
      <CardDescription>{desc}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs uppercase text-muted-foreground">Example request</Label>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onCopy(exampleReq, `${path} request copied`)}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">{exampleReq}</pre>
      </div>
      <div>
        <Label className="text-xs uppercase text-muted-foreground">Example response</Label>
        <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto mt-1">{exampleRes}</pre>
      </div>
    </CardContent>
  </Card>
);

export default Developer;
