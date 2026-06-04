import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Gift, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UserOption {
  user_id: string;
  full_name: string | null;
  username: string | null;
}

interface CashbackRow {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  admin_id: string;
  created_at: string;
  reference: string;
  user_name?: string;
  admin_name?: string;
}

const AdminCashbackTab = () => {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selected, setSelected] = useState<UserOption | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<CashbackRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cashback_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    const rows = (data || []) as CashbackRow[];
    const ids = Array.from(new Set(rows.flatMap((r) => [r.user_id, r.admin_id])));
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, username")
        .in("user_id", ids);
      const map = new Map((profiles || []).map((p) => [p.user_id, p.full_name || p.username || "Unknown"]));
      rows.forEach((r) => {
        r.user_name = map.get(r.user_id) || "Unknown";
        r.admin_name = map.get(r.admin_id) || "Admin";
      });
    }
    setHistory(rows);
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (search.trim().length < 2) {
        setUsers([]);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, username")
        .or(`full_name.ilike.%${search}%,username.ilike.%${search}%`)
        .limit(10);
      setUsers((data || []) as UserOption[]);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const submit = async () => {
    if (!selected) return toast.error("Select a user");
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount");
    if (!reason.trim()) return toast.error("Reason is required");

    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("admin-grant-cashback", {
      body: { user_id: selected.user_id, amount: amt, reason: reason.trim() },
    });
    setSubmitting(false);

    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to credit cashback");
      return;
    }
    toast.success(`Cashback of ₦${amt.toLocaleString()} credited`);
    setSelected(null);
    setSearch("");
    setUsers([]);
    setAmount("");
    setReason("");
    fetchHistory();
  };

  const totalGiven = history.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Cashback Issued</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">₦{totalGiven.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Records</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{history.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Unique Recipients</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{new Set(history.map((h) => h.user_id)).size}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> Credit Cashback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Find user</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name or username"
                value={selected ? `${selected.full_name || selected.username}` : search}
                onChange={(e) => { setSelected(null); setSearch(e.target.value); }}
              />
            </div>
            {!selected && users.length > 0 && (
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {users.map((u) => (
                  <button
                    key={u.user_id}
                    className="w-full text-left px-3 py-2 hover:bg-muted"
                    onClick={() => { setSelected(u); setUsers([]); }}
                  >
                    <div className="font-medium">{u.full_name || "Unnamed"}</div>
                    <div className="text-xs text-muted-foreground">@{u.username || "—"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Amount (₦)</Label>
            <Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Compensation for failed transaction" maxLength={500} />
          </div>

          <Button onClick={submit} disabled={submitting || !selected} className="w-full">
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Credit Cashback
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cashback History</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No cashback issued yet</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Admin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell>{r.user_name}</TableCell>
                      <TableCell className="font-medium text-emerald-600">₦{Number(r.amount).toLocaleString()}</TableCell>
                      <TableCell className="max-w-xs truncate" title={r.reason}>{r.reason}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.admin_name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCashbackTab;
