import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Code, Key, Activity, BookOpen, Copy, Plus, Trash2, AlertCircle, CheckCircle2, Clock, Wallet, Search, Phone, Database } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type AccessRequest = { id: string; status: string; reason: string | null; business_name: string | null; rejection_reason: string | null; created_at: string };
type ApiKey = { id: string; name: string; key_prefix: string; is_revoked: boolean; last_used_at: string | null; created_at: string; rate_limit_per_min: number };
type ApiWallet = { balance: number };
type ApiLog = { id: string; endpoint: string; method: string; status_code: number; success: boolean; response_time_ms: number | null; created_at: string };
type ServicePlan = { id: string; plan_id: string; plan_name: string; network: string; selling_price: number | null; base_price: number; validity: string | null; is_enabled: boolean; failure_count: number; permanently_disabled: boolean };

const NETWORKS = ["MTN", "GLO", "AIRTEL", "9MOBILE"] as const;
const AIRTIME_MIN = 50;

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/developer-api`;

const Developer = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accessRequest, setAccessRequest] = useState<AccessRequest | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [wallet, setWallet] = useState<ApiWallet>({ balance: 0 });
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [reason, setReason] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const isApproved = accessRequest?.status === "approved";

  const stats = useMemo(() => {
    const total = logs.length;
    const success = logs.filter(l => l.success).length;
    return { total, success, failed: total - success };
  }, [logs]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: req }, { data: ks }, { data: w }, { data: ls }] = await Promise.all([
      supabase.from("api_access_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("api_keys").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("api_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("api_request_logs").select("id, endpoint, method, status_code, success, response_time_ms, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    ]);
    setAccessRequest(req as AccessRequest | null);
    setKeys((ks as ApiKey[]) ?? []);
    setWallet({ balance: Number(w?.balance ?? 0) });
    setLogs((ls as ApiLog[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [user?.id]);

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
    if (error) { toast.error(error.message); return; }
    toast.success("Access request submitted. An admin will review it shortly.");
    setReason(""); setBusinessName("");
    loadData();
  };

  const generateKey = async () => {
    if (!keyName.trim()) { toast.error("Enter a key name"); return; }
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
    if (error) { toast.error(error.message); return; }
    toast.success("Key revoked");
    loadData();
  };

  const copy = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text);
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

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {!accessRequest && (
          <Card>
            <CardHeader>
              <CardTitle>Request API Access</CardTitle>
              <CardDescription>Tell us about your project. An admin will review your request.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="biz">Business / Project Name</Label>
                <Input id="biz" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. AcmeRecharge Ltd" maxLength={100} />
              </div>
              <div>
                <Label htmlFor="reason">What will you build?</Label>
                <Textarea id="reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Describe your use case..." rows={4} maxLength={500} />
              </div>
              <Button onClick={requestAccess} disabled={requesting} className="w-full">
                {requesting ? "Submitting..." : "Submit Request"}
              </Button>
            </CardContent>
          </Card>
        )}

        {accessRequest && accessRequest.status === "pending" && (
          <Alert>
            <Clock className="h-4 w-4" />
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
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="keys" className="gap-2"><Key className="h-4 w-4" /><span className="hidden sm:inline">Keys</span></TabsTrigger>
              <TabsTrigger value="usage" className="gap-2"><Activity className="h-4 w-4" /><span className="hidden sm:inline">Usage</span></TabsTrigger>
              <TabsTrigger value="wallet" className="gap-2"><Wallet className="h-4 w-4" /><span className="hidden sm:inline">Wallet</span></TabsTrigger>
              <TabsTrigger value="docs" className="gap-2"><BookOpen className="h-4 w-4" /><span className="hidden sm:inline">Docs</span></TabsTrigger>
            </TabsList>

            {/* KEYS */}
            <TabsContent value="keys" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Create new key</CardTitle>
                  <CardDescription>Keys are shown once. Save them securely.</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="e.g. Production server" maxLength={50} />
                  <Button onClick={generateKey} disabled={creatingKey} className="gap-2">
                    <Plus className="h-4 w-4" /> Generate
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">Your API Keys</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {keys.length === 0 && <p className="text-sm text-muted-foreground">No keys yet.</p>}
                  {keys.map(k => (
                    <div key={k.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{k.name}</span>
                          {k.is_revoked ? (
                            <Badge variant="destructive">Revoked</Badge>
                          ) : (
                            <Badge variant="default" className="bg-green-600">Active</Badge>
                          )}
                          <Badge variant="outline">{k.rate_limit_per_min}/min</Badge>
                        </div>
                        <code className="text-xs text-muted-foreground">{k.key_prefix}••••••••••••</code>
                        <p className="text-xs text-muted-foreground mt-1">
                          {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString()}` : "Never used"}
                        </p>
                      </div>
                      {!k.is_revoked && (
                        <Button size="icon" variant="ghost" onClick={() => revokeKey(k.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* USAGE */}
            <TabsContent value="usage" className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total calls</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Successful</p><p className="text-2xl font-bold text-green-600">{stats.success}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Failed</p><p className="text-2xl font-bold text-destructive">{stats.failed}</p></CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle className="text-lg">Recent requests</CardTitle></CardHeader>
                <CardContent className="space-y-1 max-h-[500px] overflow-y-auto">
                  {logs.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
                  {logs.map(l => (
                    <div key={l.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        {l.success ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
                        <Badge variant="outline" className="font-mono text-[10px]">{l.method}</Badge>
                        <code className="text-xs truncate">{l.endpoint}</code>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span>{l.status_code}</span>
                        <span>{l.response_time_ms ?? 0}ms</span>
                        <span className="hidden sm:inline">{new Date(l.created_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* WALLET */}
            <TabsContent value="wallet">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">API Wallet Balance</CardTitle>
                  <CardDescription>Funds used exclusively for API purchases</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold text-primary">₦{wallet.balance.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    To fund this wallet, contact support or an admin. (Self-service funding can be enabled later.)
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* DOCS */}
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
                  <p className="text-sm text-muted-foreground mt-3">
                    Send your key in the <code className="bg-muted px-1 rounded">Authorization: Bearer YOUR_KEY</code> header on every request.
                  </p>
                </CardContent>
              </Card>

              <EndpointDoc
                method="GET" path="/balance" desc="Get your API wallet balance"
                onCopy={copy}
                exampleReq={`curl ${API_BASE}/balance \\\n  -H "Authorization: Bearer ink_live_xxx"`}
                exampleRes={`{ "success": true, "balance": 5000, "currency": "NGN" }`}
              />
              <EndpointDoc
                method="GET" path="/data-plans?network=mtn" desc="List available data plans"
                onCopy={copy}
                exampleReq={`curl "${API_BASE}/data-plans?network=mtn" \\\n  -H "Authorization: Bearer ink_live_xxx"`}
                exampleRes={`{\n  "success": true,\n  "count": 12,\n  "plans": [\n    { "plan_id": "1", "plan_name": "1GB - 30 days", "network": "MTN", "selling_price": 500, "validity": "30 days" }\n  ]\n}`}
              />
              <EndpointDoc
                method="POST" path="/buy-airtime" desc="Purchase airtime"
                onCopy={copy}
                exampleReq={`curl -X POST ${API_BASE}/buy-airtime \\\n  -H "Authorization: Bearer ink_live_xxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{"network":"mtn","phone":"08031234567","amount":100}'`}
                exampleRes={`{ "success": true, "reference": "api_air_...", "amount": 100, "provider": "subpadi" }`}
              />
              <EndpointDoc
                method="POST" path="/buy-data" desc="Purchase a data bundle"
                onCopy={copy}
                exampleReq={`curl -X POST ${API_BASE}/buy-data \\\n  -H "Authorization: Bearer ink_live_xxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{"network":"mtn","phone":"08031234567","plan_id":"1"}'`}
                exampleRes={`{ "success": true, "reference": "api_data_...", "plan_id": "1", "amount": 500 }`}
              />
              <EndpointDoc
                method="POST" path="/buy-cable" desc="Pay cable TV subscription"
                onCopy={copy}
                exampleReq={`curl -X POST ${API_BASE}/buy-cable \\\n  -H "Authorization: Bearer ink_live_xxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{"provider":"dstv","smartcard":"1234567890","plan_id":"PADI-DSTV-COMPACT"}'`}
                exampleRes={`{ "success": true, "reference": "api_cable_...", "amount": 19000 }`}
              />
              <EndpointDoc
                method="POST" path="/buy-electricity" desc="Buy electricity tokens"
                onCopy={copy}
                exampleReq={`curl -X POST ${API_BASE}/buy-electricity \\\n  -H "Authorization: Bearer ink_live_xxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{"disco":"ekedc","meter":"1234567890","meter_type":"prepaid","amount":1000}'`}
                exampleRes={`{ "success": true, "reference": "api_elec_...", "token": "1234-5678-9012-3456", "units": "8.5kWh" }`}
              />

              <Card>
                <CardHeader><CardTitle className="text-lg">Errors</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><code className="bg-muted px-1 rounded">401</code> — Missing / invalid / revoked API key</p>
                  <p><code className="bg-muted px-1 rounded">400</code> — Invalid request body</p>
                  <p><code className="bg-muted px-1 rounded">429</code> — Rate limit exceeded</p>
                  <p><code className="bg-muted px-1 rounded">502</code> — Provider error (wallet auto-refunded)</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* New key modal */}
      <Dialog open={!!newKey} onOpenChange={(o) => { if (!o) setNewKey(null); }}>
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
          <Label className="text-xs uppercase text-muted-foreground">Request</Label>
          <Button size="icon" variant="ghost" onClick={() => onCopy(exampleReq, "Request copied")}><Copy className="h-3 w-3" /></Button>
        </div>
        <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all">{exampleReq}</pre>
      </div>
      <div>
        <Label className="text-xs uppercase text-muted-foreground">Response</Label>
        <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all mt-1">{exampleRes}</pre>
      </div>
    </CardContent>
  </Card>
);

export default Developer;
