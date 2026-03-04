import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Building2, Copy, Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

interface VirtualAccountWithProfile {
  id: string;
  user_id: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  bank_code: string | null;
  customer_code: string | null;
  dva_id: string | null;
  is_active: boolean | null;
  created_at: string;
  full_name: string | null;
  phone_number: string | null;
}

const AdminVirtualAccountsTab = () => {
  const [accounts, setAccounts] = useState<VirtualAccountWithProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setIsLoading(true);

    const { data: accountsData, error } = await supabase
      .from("virtual_accounts")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && accountsData) {
      const userIds = accountsData.map((a) => a.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone_number")
        .in("user_id", userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, p])
      );

      setAccounts(
        accountsData.map((a) => ({
          ...a,
          full_name: profileMap.get(a.user_id)?.full_name || null,
          phone_number: profileMap.get(a.user_id)?.phone_number || null,
        }))
      );
    }
    setIsLoading(false);
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  const filteredAccounts = accounts.filter((account) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      account.account_number?.includes(searchQuery) ||
      account.account_name?.toLowerCase().includes(searchLower) ||
      account.profile?.full_name?.toLowerCase().includes(searchLower) ||
      account.user_email?.toLowerCase().includes(searchLower) ||
      account.bank_name?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by account number, name, or email..."
            className="pl-10 h-12 rounded-xl"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchAccounts}
          className="h-12 w-12 rounded-xl"
        >
          <RefreshCw className="h-5 w-5" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm text-muted-foreground">Total Accounts</p>
          <p className="text-2xl font-bold text-primary">{accounts.length}</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm text-muted-foreground">Active Accounts</p>
          <p className="text-2xl font-bold text-success">
            {accounts.filter(a => a.is_active).length}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAccounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No virtual accounts found
            </div>
          ) : (
            filteredAccounts.map((account) => (
              <div
                key={account.id}
                className="glass-card rounded-2xl p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {account.profile?.full_name || "Unknown User"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {account.user_email}
                      </p>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-muted-foreground">Bank:</p>
                          <p className="text-sm font-medium">{account.bank_name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-muted-foreground">Account:</p>
                          <p className="text-sm font-mono font-bold">{account.account_number}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleCopy(account.account_number, account.id)}
                          >
                            {copiedId === account.id ? (
                              <Check className="h-3 w-3 text-success" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-muted-foreground">Name:</p>
                          <p className="text-sm">{account.account_name}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium",
                      account.is_active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                    )}>
                      {account.is_active ? "Active" : "Inactive"}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(account.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AdminVirtualAccountsTab;
