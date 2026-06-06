import { useCallback, useEffect, useState } from "react";
import { Building2, Copy, Check, Loader2, RefreshCw, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DevVA {
  id: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  provider: string | null;
  is_active: boolean;
  user_id: string;
}

const DeveloperVirtualAccountCard = ({ autoCreate = true }: { autoCreate?: boolean }) => {
  const { user } = useAuth();
  const [account, setAccount] = useState<DevVA | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchAccount = useCallback(async () => {
    if (!user) return;
    const { data, error: e } = await (supabase as any)
      .from("virtual_accounts")
      .select("id, account_number, account_name, bank_name, provider, is_active, user_id")
      .eq("user_id", user.id)
      .eq("wallet_type", "developer")
      .maybeSingle();
    if (e) {
      console.error(e);
      setError(e.message);
    } else {
      setAccount(data || null);
    }
    setLoading(false);
  }, [user]);

  const createAccount = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.functions.invoke("create-developer-virtual-account");
      if (e) throw e;
      if ((data as any)?.error) throw new Error((data as any).error);
      if ((data as any)?.account) {
        setAccount((data as any).account);
        toast.success("Developer virtual account ready");
      } else {
        await fetchAccount();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create account";
      setError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }, [fetchAccount]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  // Auto-create on first load if missing
  useEffect(() => {
    if (!loading && !account && autoCreate && !creating && !error) {
      createAccount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!account) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 space-y-4 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Developer Virtual Account</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create a dedicated bank account to fund your Developer Wallet via transfer.
            </p>
          </div>
          {error && (
            <Alert variant="destructive" className="text-left">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={createAccount} disabled={creating} className="bg-green-600 hover:bg-green-700">
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {creating ? "Creating…" : "Create Virtual Account"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-green-500/20 bg-gradient-to-br from-green-50/50 to-emerald-50/30 dark:from-green-950/30 dark:to-emerald-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5 text-green-600" />
            Developer Virtual Account
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs px-2 py-1 rounded-full",
              account.is_active ? "bg-green-600/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive",
            )}>
              {account.is_active ? "Active" : "Inactive"}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchAccount} title="Refresh status">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-xl bg-background/70">
          <div>
            <p className="text-xs text-muted-foreground">Bank</p>
            <p className="font-semibold">{account.bank_name}</p>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-background/70">
          <div>
            <p className="text-xs text-muted-foreground">Account Number</p>
            <p className="font-mono font-bold text-lg tracking-wider">{account.account_number}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => handleCopy(account.account_number, "Account number")}>
            {copied === "Account number" ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-background/70">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Account Name</p>
            <p className="font-semibold truncate">{account.account_name}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-10 w-10 flex-shrink-0" onClick={() => handleCopy(account.account_name, "Account name")}>
            {copied === "Account name" ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
          <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How to Fund Your Developer Wallet</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Transfer any amount to the account number above.</li>
              <li>Your Developer Wallet is credited instantly — no extra fees.</li>
              <li>Use the balance to pay for API calls.</li>
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DeveloperVirtualAccountCard;
