import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, RefreshCw, Activity, User, Wallet, KeyRound, Ban, CheckCircle } from "lucide-react";
import { format } from "date-fns";

interface ActivityLog {
  id: string;
  admin_id: string;
  action: string;
  target_user_id: string | null;
  target_type: string | null;
  target_id: string | null;
  details: any;
  created_at: string;
  admin_profile?: {
    full_name: string | null;
  };
  target_profile?: {
    full_name: string | null;
  };
}

const AdminActivityLogTab = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("admin_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch admin and target profiles
      const adminIds = [...new Set(data?.map((l) => l.admin_id) || [])];
      const targetUserIds = [...new Set(data?.filter((l) => l.target_user_id).map((l) => l.target_user_id!) || [])];

      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", adminIds);

      const { data: targetProfiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", targetUserIds);

      const adminMap = new Map(adminProfiles?.map((p) => [p.user_id, p]));
      const targetMap = new Map(targetProfiles?.map((p) => [p.user_id, p]));

      const logsWithProfiles = data?.map((log) => ({
        ...log,
        admin_profile: adminMap.get(log.admin_id),
        target_profile: log.target_user_id ? targetMap.get(log.target_user_id) : undefined,
      })) || [];

      setLogs(logsWithProfiles);
    } catch (error) {
      console.error("Failed to fetch activity logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "suspend_user":
        return <Ban className="h-4 w-4 text-red-500" />;
      case "unsuspend_user":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "reset_transaction_pin":
        return <KeyRound className="h-4 w-4 text-orange-500" />;
      case "wallet_credit":
        return <Wallet className="h-4 w-4 text-green-500" />;
      case "wallet_debit":
        return <Wallet className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-primary" />;
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      suspend_user: "Suspended User",
      unsuspend_user: "Unsuspended User",
      reset_transaction_pin: "Reset PIN",
      wallet_credit: "Wallet Credit",
      wallet_debit: "Wallet Debit",
    };
    return labels[action] || action.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case "suspend_user":
      case "wallet_debit":
        return "bg-red-500/10 text-red-500";
      case "unsuspend_user":
      case "wallet_credit":
        return "bg-green-500/10 text-green-500";
      case "reset_transaction_pin":
        return "bg-orange-500/10 text-orange-500";
      default:
        return "bg-primary/10 text-primary";
    }
  };

  const filteredLogs = logs.filter(
    (log) =>
      log.admin_profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.target_profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by admin, target user, or action..."
            className="pl-10 h-11 rounded-xl"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-full sm:w-48 h-11 rounded-xl">
            <SelectValue placeholder="Filter by action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="suspend_user">Suspend User</SelectItem>
            <SelectItem value="unsuspend_user">Unsuspend User</SelectItem>
            <SelectItem value="reset_transaction_pin">Reset PIN</SelectItem>
            <SelectItem value="wallet_credit">Wallet Credit</SelectItem>
            <SelectItem value="wallet_debit">Wallet Debit</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchLogs}
          disabled={isLoading}
          className="h-11 w-11 rounded-xl shrink-0"
        >
          <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold">{logs.length}</p>
          <p className="text-sm text-muted-foreground">Total Actions</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-orange-500">
            {logs.filter((l) => l.action === "reset_transaction_pin").length}
          </p>
          <p className="text-sm text-muted-foreground">PIN Resets</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-green-500">
            {logs.filter((l) => l.action === "wallet_credit").length}
          </p>
          <p className="text-sm text-muted-foreground">Wallet Credits</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-red-500">
            {logs.filter((l) => l.action === "suspend_user").length}
          </p>
          <p className="text-sm text-muted-foreground">Suspensions</p>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Target User</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getActionIcon(log.action)}
                        <Badge className={getActionBadgeColor(log.action)}>
                          {getActionLabel(log.action)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium text-sm">
                          {log.admin_profile?.full_name || "Unknown"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.target_profile?.full_name || log.target_user_id?.substring(0, 8) || "—"}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {log.details ? (
                        <span className="text-sm text-muted-foreground truncate block">
                          {log.details.reason || log.details.amount ? 
                            `${log.details.amount ? `₦${parseFloat(log.details.amount).toLocaleString()} - ` : ""}${log.details.reason || ""}` 
                            : JSON.stringify(log.details).substring(0, 50)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), "MMM d, HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No activity logs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminActivityLogTab;