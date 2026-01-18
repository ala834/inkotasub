import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, RefreshCw, User, MoreVertical, Ban, CheckCircle, Eye, Wallet, KeyRound, History } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  is_agent: boolean | null;
  suspended_at: string | null;
  created_at: string;
  transaction_pin: string | null;
  wallet?: {
    balance: number;
  };
  transaction_count?: number;
  email?: string;
}

const AdminUserManagementTab = () => {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showPinResetDialog, setShowPinResetDialog] = useState(false);
  const [pinResetUser, setPinResetUser] = useState<UserProfile | null>(null);
  const [pinResetReason, setPinResetReason] = useState("");
  const [showTransactionsDialog, setShowTransactionsDialog] = useState(false);
  const [userTransactions, setUserTransactions] = useState<any[]>([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch wallets
      const userIds = profiles?.map((p) => p.user_id) || [];
      const { data: wallets } = await supabase
        .from("wallets")
        .select("user_id, balance")
        .in("user_id", userIds);

      // Fetch transaction counts
      const { data: txCounts } = await supabase
        .from("transactions")
        .select("user_id")
        .in("user_id", userIds);

      const walletMap = new Map(wallets?.map((w) => [w.user_id, w]));
      const txCountMap = new Map<string, number>();
      txCounts?.forEach((tx) => {
        txCountMap.set(tx.user_id, (txCountMap.get(tx.user_id) || 0) + 1);
      });

      const usersWithData = profiles?.map((profile) => ({
        ...profile,
        wallet: walletMap.get(profile.user_id),
        transaction_count: txCountMap.get(profile.user_id) || 0,
      })) || [];

      setUsers(usersWithData);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast.error("Failed to fetch users");
    } finally {
      setIsLoading(false);
    }
  };

  const logAdminActivity = async (action: string, targetUserId: string, details?: object) => {
    if (!currentAdmin) return;
    try {
      await supabase.from("admin_activity_log").insert({
        admin_id: currentAdmin.id,
        action,
        target_user_id: targetUserId,
        target_type: "user",
        details: details as any,
      } as any);
    } catch (error) {
      console.error("Failed to log admin activity:", error);
    }
  };

  const handleSuspendUser = async (userId: string, suspend: boolean) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ suspended_at: suspend ? new Date().toISOString() : null })
        .eq("user_id", userId);

      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId
            ? { ...u, suspended_at: suspend ? new Date().toISOString() : null }
            : u
        )
      );

      await logAdminActivity(suspend ? "suspend_user" : "unsuspend_user", userId);
      toast.success(suspend ? "User suspended successfully" : "User unsuspended successfully");
    } catch (error) {
      console.error("Failed to update user:", error);
      toast.error("Failed to update user");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResetPin = async () => {
    if (!pinResetUser || !pinResetReason.trim()) {
      toast.error("Please provide a reason for PIN reset");
      return;
    }

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          transaction_pin: null, 
          failed_pin_attempts: 0, 
          pin_locked_until: null 
        })
        .eq("user_id", pinResetUser.user_id);

      if (error) throw error;

      await logAdminActivity("reset_transaction_pin", pinResetUser.user_id, { reason: pinResetReason });

      // Create notification for user
      await supabase.from("notifications").insert({
        user_id: pinResetUser.user_id,
        title: "Transaction PIN Reset",
        message: "Your transaction PIN has been reset by an administrator. Please set a new PIN in your settings.",
        type: "warning",
      });

      toast.success("Transaction PIN reset successfully");
      setShowPinResetDialog(false);
      setPinResetUser(null);
      setPinResetReason("");
      fetchUsers();
    } catch (error) {
      console.error("Failed to reset PIN:", error);
      toast.error("Failed to reset PIN");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleViewTransactions = async (userProfile: UserProfile) => {
    setSelectedUser(userProfile);
    setShowTransactionsDialog(true);
    
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userProfile.user_id)
      .order("created_at", { ascending: false })
      .limit(20);

    setUserTransactions(data || []);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const filteredUsers = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone_number?.includes(searchQuery) ||
      u.user_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, or user ID..."
            className="pl-10 h-11 rounded-xl"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchUsers}
          disabled={isLoading}
          className="h-11 w-11 rounded-xl"
        >
          <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold">{users.length}</p>
          <p className="text-sm text-muted-foreground">Total Users</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold">{users.filter((u) => u.is_agent).length}</p>
          <p className="text-sm text-muted-foreground">Agents</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-destructive">
            {users.filter((u) => u.suspended_at).length}
          </p>
          <p className="text-sm text-muted-foreground">Suspended</p>
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
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className={user.suspended_at ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt=""
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <User className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{user.full_name || "No name"}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.phone_number || "No phone"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {user.is_agent && (
                          <Badge className="bg-primary/10 text-primary">Agent</Badge>
                        )}
                        {user.suspended_at && (
                          <Badge variant="destructive">Suspended</Badge>
                        )}
                        {!user.is_agent && !user.suspended_at && (
                          <Badge variant="secondary">User</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {user.wallet ? formatCurrency(parseFloat(user.wallet.balance as unknown as string)) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{user.transaction_count}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(user.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedUser(user)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewTransactions(user)}>
                            <History className="h-4 w-4 mr-2" />
                            Transaction History
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setPinResetUser(user);
                              setShowPinResetDialog(true);
                            }}
                          >
                            <KeyRound className="h-4 w-4 mr-2" />
                            Reset PIN
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {user.suspended_at ? (
                            <DropdownMenuItem
                              onClick={() => handleSuspendUser(user.user_id, false)}
                              disabled={isUpdating}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Unsuspend User
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleSuspendUser(user.user_id, true)}
                              disabled={isUpdating}
                              className="text-destructive"
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Suspend User
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* User Details Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              User ID: {selectedUser?.user_id.substring(0, 8)}...
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                  {selectedUser.avatar_url ? (
                    <img
                      src={selectedUser.avatar_url}
                      alt=""
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <User className="h-8 w-8 text-primary" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-lg">{selectedUser.full_name || "No name"}</p>
                  <p className="text-muted-foreground">{selectedUser.phone_number || "No phone"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Wallet className="h-4 w-4" />
                    <span className="text-sm">Balance</span>
                  </div>
                  <p className="font-semibold">
                    {selectedUser.wallet
                      ? formatCurrency(parseFloat(selectedUser.wallet.balance as unknown as string))
                      : "N/A"}
                  </p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Transactions</p>
                  <p className="font-semibold">{selectedUser.transaction_count}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Status</p>
                  <div className="flex gap-1">
                    {selectedUser.is_agent && <Badge className="bg-primary/10 text-primary">Agent</Badge>}
                    {selectedUser.suspended_at ? (
                      <Badge variant="destructive">Suspended</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </div>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Joined</p>
                  <p className="font-semibold">
                    {format(new Date(selectedUser.created_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>

              {selectedUser.suspended_at && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <p className="text-sm text-destructive">
                    Suspended on {format(new Date(selectedUser.suspended_at), "MMM d, yyyy 'at' HH:mm")}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedUser(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* PIN Reset Dialog */}
      <Dialog open={showPinResetDialog} onOpenChange={setShowPinResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Transaction PIN</DialogTitle>
            <DialogDescription>
              Reset the transaction PIN for {pinResetUser?.full_name || "this user"}. They will need to set a new PIN.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-sm text-destructive">
                This action cannot be undone. The user will be notified and required to set a new PIN.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin-reset-reason">Reason for Reset *</Label>
              <Textarea
                id="pin-reset-reason"
                value={pinResetReason}
                onChange={(e) => setPinResetReason(e.target.value)}
                placeholder="Enter the reason for resetting this user's PIN..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowPinResetDialog(false);
              setPinResetUser(null);
              setPinResetReason("");
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetPin}
              disabled={isUpdating || !pinResetReason.trim()}
            >
              {isUpdating ? "Resetting..." : "Reset PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Transactions Dialog */}
      <Dialog open={showTransactionsDialog} onOpenChange={setShowTransactionsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Transaction History</DialogTitle>
            <DialogDescription>
              Recent transactions for {selectedUser?.full_name || "user"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {userTransactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No transactions found</p>
            ) : (
              userTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{tx.description || tx.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${tx.type === "credit" ? "text-green-500" : "text-red-500"}`}>
                      {tx.type === "credit" ? "+" : "-"}₦{parseFloat(tx.amount).toLocaleString()}
                    </p>
                    <Badge variant={tx.status === "success" ? "default" : "destructive"} className="text-xs">
                      {tx.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransactionsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUserManagementTab;
