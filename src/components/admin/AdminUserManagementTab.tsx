import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Search,
  RefreshCw,
  User,
  MoreVertical,
  Ban,
  CheckCircle,
  Eye,
  Wallet,
  KeyRound,
  History,
  Lock,
  Building2,
  Mail,
  Phone,
  Filter,
  Download,
} from "lucide-react";
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
  virtual_account?: {
    account_number: string;
    account_name: string;
    bank_name: string;
    provider: string | null;
    is_active: boolean | null;
  };
}

const AdminUserManagementTab = () => {
  const { user: currentAdmin, session } = useAuth();
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
  const [showWalletAdjustDialog, setShowWalletAdjustDialog] = useState(false);
  const [walletAdjustUser, setWalletAdjustUser] = useState<UserProfile | null>(null);
  const [walletAdjustAmount, setWalletAdjustAmount] = useState("");
  const [walletAdjustType, setWalletAdjustType] = useState<"credit" | "debit">("credit");
  const [walletAdjustReason, setWalletAdjustReason] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "0-1000" | "1000-10000" | "10000-50000" | "50000+">("all");
  const [showFilters, setShowFilters] = useState(false);

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

      const userIds = profiles?.map((p) => p.user_id) || [];

      // Fetch wallets, transactions, virtual accounts, emails in parallel
      const [walletsRes, txRes, vaRes, emailsRes] = await Promise.all([
        supabase.from("wallets").select("user_id, balance").in("user_id", userIds),
        supabase.from("transactions").select("user_id").in("user_id", userIds),
        supabase.from("virtual_accounts").select("user_id, account_number, account_name, bank_name, provider, is_active").in("user_id", userIds),
        session?.access_token
          ? supabase.functions.invoke("admin-get-user-emails", {
              headers: { Authorization: `Bearer ${session.access_token}` },
            })
          : Promise.resolve({ data: { emails: {} }, error: null }),
      ]);

      const walletMap = new Map(walletsRes.data?.map((w) => [w.user_id, w]));
      const txCountMap = new Map<string, number>();
      txRes.data?.forEach((tx) => {
        txCountMap.set(tx.user_id, (txCountMap.get(tx.user_id) || 0) + 1);
      });
      const vaMap = new Map(vaRes.data?.map((va) => [va.user_id, va]));
      const emailMap: Record<string, string> = emailsRes?.data?.emails || {};

      const usersWithData = profiles?.map((profile) => ({
        ...profile,
        wallet: walletMap.get(profile.user_id),
        transaction_count: txCountMap.get(profile.user_id) || 0,
        virtual_account: vaMap.get(profile.user_id),
        email: emailMap[profile.user_id] || undefined,
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

      // Notify user
      await supabase.from("notifications").insert({
        user_id: userId,
        title: suspend ? "Account Suspended" : "Account Activated",
        message: suspend
          ? "Your account has been suspended by an administrator. Contact support for more information."
          : "Your account has been reactivated. You can now use all services.",
        type: suspend ? "warning" : "success",
      });

      await logAdminActivity(suspend ? "suspend_user" : "activate_user", userId);
      toast.success(suspend ? "User suspended" : "User activated");
    } catch (error) {
      console.error("Failed to update user:", error);
      toast.error("Failed to update user status");
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
        .update({ transaction_pin: null, failed_pin_attempts: 0, pin_locked_until: null })
        .eq("user_id", pinResetUser.user_id);

      if (error) throw error;

      await logAdminActivity("reset_transaction_pin", pinResetUser.user_id, { reason: pinResetReason });

      await supabase.from("notifications").insert({
        user_id: pinResetUser.user_id,
        title: "Transaction PIN Reset",
        message: "Your transaction PIN has been reset by an administrator. Please set a new PIN.",
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

  const handleWalletAdjust = async () => {
    if (!walletAdjustUser || !walletAdjustAmount || !walletAdjustReason.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    const amount = parseFloat(walletAdjustAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const currentBalance = parseFloat(walletAdjustUser.wallet?.balance as unknown as string) || 0;
    if (walletAdjustType === "debit" && amount > currentBalance) {
      toast.error("Debit amount exceeds current balance");
      return;
    }

    setIsUpdating(true);
    try {
      const newBalance = walletAdjustType === "credit"
        ? currentBalance + amount
        : currentBalance - amount;

      const { error: walletError } = await supabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("user_id", walletAdjustUser.user_id);

      if (walletError) throw walletError;

      await logAdminActivity("wallet_adjustment", walletAdjustUser.user_id, {
        type: walletAdjustType,
        amount,
        previous_balance: currentBalance,
        new_balance: newBalance,
        reason: walletAdjustReason,
      });

      await supabase.from("notifications").insert({
        user_id: walletAdjustUser.user_id,
        title: `Wallet ${walletAdjustType === "credit" ? "Credited" : "Debited"}`,
        message: `Your wallet has been ${walletAdjustType === "credit" ? "credited with" : "debited by"} ₦${amount.toLocaleString()}. Reason: ${walletAdjustReason}`,
        type: walletAdjustType === "credit" ? "success" : "warning",
      });

      toast.success(`Wallet ${walletAdjustType}ed successfully`);
      setShowWalletAdjustDialog(false);
      setWalletAdjustUser(null);
      setWalletAdjustAmount("");
      setWalletAdjustReason("");
      fetchUsers();
    } catch (error) {
      console.error("Failed to adjust wallet:", error);
      toast.error("Failed to adjust wallet");
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
      .limit(50);

    setUserTransactions(data || []);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getBalance = (user: UserProfile): number => {
    return parseFloat(user.wallet?.balance as unknown as string) || 0;
  };

  const filteredUsers = users.filter((u) => {
    // Text search: phone, email, name
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      u.full_name?.toLowerCase().includes(q) ||
      u.phone_number?.includes(searchQuery) ||
      u.email?.toLowerCase().includes(q) ||
      u.user_id.toLowerCase().includes(q);

    // Status filter
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && !u.suspended_at) ||
      (statusFilter === "suspended" && !!u.suspended_at);

    // Balance filter
    const balance = getBalance(u);
    let matchesBalance = true;
    if (balanceFilter === "0-1000") matchesBalance = balance >= 0 && balance <= 1000;
    else if (balanceFilter === "1000-10000") matchesBalance = balance > 1000 && balance <= 10000;
    else if (balanceFilter === "10000-50000") matchesBalance = balance > 10000 && balance <= 50000;
    else if (balanceFilter === "50000+") matchesBalance = balance > 50000;

    return matchesSearch && matchesStatus && matchesBalance;
  });

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, email..."
            className="pl-10 h-11 rounded-xl"
          />
        </div>
        <Button
          variant={showFilters ? "default" : "outline"}
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          className="h-11 w-11 rounded-xl"
        >
          <Filter className="h-5 w-5" />
        </Button>
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

      {/* Filter Row */}
      {showFilters && (
        <div className="flex gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[160px] rounded-xl">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Select value={balanceFilter} onValueChange={(v) => setBalanceFilter(v as any)}>
            <SelectTrigger className="w-[180px] rounded-xl">
              <SelectValue placeholder="Balance Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Balances</SelectItem>
              <SelectItem value="0-1000">₦0 – ₦1,000</SelectItem>
              <SelectItem value="1000-10000">₦1,000 – ₦10,000</SelectItem>
              <SelectItem value="10000-50000">₦10,000 – ₦50,000</SelectItem>
              <SelectItem value="50000+">₦50,000+</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold">{users.length}</p>
          <p className="text-sm text-muted-foreground">Total Users</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold">{users.filter((u) => !u.suspended_at).length}</p>
          <p className="text-sm text-muted-foreground">Active</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-destructive">
            {users.filter((u) => u.suspended_at).length}
          </p>
          <p className="text-sm text-muted-foreground">Suspended</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold">{users.filter((u) => u.is_agent).length}</p>
          <p className="text-sm text-muted-foreground">Agents</p>
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
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>PIN</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Txns</TableHead>
                  <TableHead>Virtual Acc.</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className={user.suspended_at ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <User className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{user.full_name || "No name"}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.phone_number || "No phone"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm truncate max-w-[180px]">{user.email || "—"}</p>
                    </TableCell>
                    <TableCell>
                      {user.suspended_at ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Lock className="h-3 w-3" />
                        {user.transaction_pin ? "Set" : "Not Set"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {user.wallet ? formatCurrency(getBalance(user)) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{user.transaction_count}</TableCell>
                    <TableCell>
                      {user.virtual_account ? (
                        <div className="text-xs">
                          <p className="font-medium">{user.virtual_account.account_number}</p>
                          <p className="text-muted-foreground">{user.virtual_account.provider || "paystack"}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
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
                              setWalletAdjustUser(user);
                              setShowWalletAdjustDialog(true);
                            }}
                          >
                            <Wallet className="h-4 w-4 mr-2" />
                            Adjust Wallet
                          </DropdownMenuItem>
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
                            <DropdownMenuItem onClick={() => handleSuspendUser(user.user_id, false)} disabled={isUpdating}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Activate User
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
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
      <Dialog open={!!selectedUser && !showTransactionsDialog} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              User ID: {selectedUser?.user_id.substring(0, 8)}...
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                  {selectedUser.avatar_url ? (
                    <img src={selectedUser.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <User className="h-8 w-8 text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-lg">{selectedUser.full_name || "No name"}</p>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm">
                    <Phone className="h-3 w-3" />
                    <span>{selectedUser.phone_number || "No phone"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm">
                    <Mail className="h-3 w-3" />
                    <span>{selectedUser.email || "No email"}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Wallet className="h-4 w-4" />
                    <span className="text-sm">Balance</span>
                  </div>
                  <p className="font-semibold">
                    {selectedUser.wallet ? formatCurrency(getBalance(selectedUser)) : "N/A"}
                  </p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Transactions</p>
                  <p className="font-semibold">{selectedUser.transaction_count}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Status</p>
                  {selectedUser.suspended_at ? (
                    <Badge variant="destructive">Suspended</Badge>
                  ) : (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                  )}
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Password</p>
                  <Badge variant="outline" className="gap-1">
                    <Lock className="h-3 w-3" />
                    Encrypted
                  </Badge>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Transaction PIN</p>
                  <Badge variant="outline" className="gap-1">
                    <Lock className="h-3 w-3" />
                    {selectedUser.transaction_pin ? "Set (Encrypted)" : "Not Set"}
                  </Badge>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Joined</p>
                  <p className="font-semibold text-sm">
                    {format(new Date(selectedUser.created_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>

              {/* Virtual Account Info */}
              {selectedUser.virtual_account && (
                <div className="bg-muted rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Building2 className="h-4 w-4" />
                    <span className="text-sm font-medium">Virtual Account</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Account Number</p>
                      <p className="font-semibold">{selectedUser.virtual_account.account_number}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Bank</p>
                      <p className="font-semibold">{selectedUser.virtual_account.bank_name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Account Name</p>
                      <p className="font-semibold">{selectedUser.virtual_account.account_name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Provider</p>
                      <p className="font-semibold capitalize">{selectedUser.virtual_account.provider || "paystack"}</p>
                    </div>
                  </div>
                </div>
              )}

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
              Reset the transaction PIN for {pinResetUser?.full_name || "this user"}.
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
            <Button
              variant="outline"
              onClick={() => {
                setShowPinResetDialog(false);
                setPinResetUser(null);
                setPinResetReason("");
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleResetPin} disabled={isUpdating || !pinResetReason.trim()}>
              {isUpdating ? "Resetting..." : "Reset PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wallet Adjustment Dialog */}
      <Dialog open={showWalletAdjustDialog} onOpenChange={setShowWalletAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Wallet Balance</DialogTitle>
            <DialogDescription>
              {walletAdjustUser?.full_name || "User"} — Current balance:{" "}
              {walletAdjustUser?.wallet ? formatCurrency(getBalance(walletAdjustUser)) : "N/A"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Adjustment Type</Label>
              <Select value={walletAdjustType} onValueChange={(v) => setWalletAdjustType(v as "credit" | "debit")}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit (Add funds)</SelectItem>
                  <SelectItem value="debit">Debit (Remove funds)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-amount">Amount (₦) *</Label>
              <Input
                id="adjust-amount"
                type="number"
                value={walletAdjustAmount}
                onChange={(e) => setWalletAdjustAmount(e.target.value)}
                placeholder="Enter amount"
                min="1"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-reason">Reason *</Label>
              <Textarea
                id="adjust-reason"
                value={walletAdjustReason}
                onChange={(e) => setWalletAdjustReason(e.target.value)}
                placeholder="Enter reason for this adjustment..."
                rows={3}
              />
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-sm text-amber-600">
                This action will be logged for audit purposes. Please ensure the reason is accurate.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowWalletAdjustDialog(false);
                setWalletAdjustUser(null);
                setWalletAdjustAmount("");
                setWalletAdjustReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleWalletAdjust}
              disabled={isUpdating || !walletAdjustAmount || !walletAdjustReason.trim()}
            >
              {isUpdating ? "Processing..." : `${walletAdjustType === "credit" ? "Credit" : "Debit"} Wallet`}
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
