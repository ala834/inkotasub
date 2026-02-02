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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, RefreshCw, Eye, RotateCcw, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface VTUOrder {
  id: string;
  user_id: string;
  service_type: string;
  provider: string;
  recipient: string;
  amount: number;
  cost_price: number | null;
  profit: number | null;
  status: string;
  api_response: unknown;
  created_at: string;
  provider_used: string | null;
  fallback_attempted: boolean | null;
  fallback_provider: string | null;
  fallback_response: unknown;
  profile?: {
    full_name: string | null;
    phone_number: string | null;
  };
}

const AdminVTUOrdersTab = () => {
  const [orders, setOrders] = useState<VTUOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<VTUOrder | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, serviceFilter]);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("vtu_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "pending" | "success" | "failed");
      }

      if (serviceFilter !== "all") {
        query = query.eq("service_type", serviceFilter as "airtime" | "cable" | "data" | "electricity" | "exam_pin");
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch user profiles for each order
      const userIds = [...new Set(data?.map((o) => o.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone_number")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]));

      const ordersWithProfiles = data?.map((order) => ({
        ...order,
        profile: profileMap.get(order.user_id),
      })) || [];

      setOrders(ordersWithProfiles);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      toast.error("Failed to fetch orders");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefund = async () => {
    if (!selectedOrder) return;

    setIsRefunding(true);
    try {
      // Get user's current wallet
      const { data: wallet, error: walletError } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", selectedOrder.user_id)
        .single();

      if (walletError) throw walletError;

      const currentBalance = parseFloat(wallet.balance as unknown as string);
      const refundAmount = parseFloat(selectedOrder.amount as unknown as string);
      const newBalance = currentBalance + refundAmount;

      // Update wallet balance
      const { error: updateError } = await supabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("user_id", selectedOrder.user_id);

      if (updateError) throw updateError;

      // Create refund transaction
      const { error: txError } = await supabase.from("transactions").insert({
        user_id: selectedOrder.user_id,
        type: "credit",
        amount: refundAmount,
        balance_before: currentBalance,
        balance_after: newBalance,
        status: "success",
        description: `Refund for ${selectedOrder.service_type} order`,
        reference: `REFUND-${selectedOrder.id.substring(0, 8)}`,
      });

      if (txError) throw txError;

      // Update order status
      const { error: orderError } = await supabase
        .from("vtu_orders")
        .update({ status: "refunded" as "pending" | "success" | "failed" })
        .eq("id", selectedOrder.id);

      if (orderError) throw orderError;

      toast.success("Refund processed successfully");
      setSelectedOrder(null);
      fetchOrders();
    } catch (error) {
      console.error("Failed to process refund:", error);
      toast.error("Failed to process refund");
    } finally {
      setIsRefunding(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-500/10 text-green-500";
      case "pending":
        return "bg-yellow-500/10 text-yellow-500";
      case "failed":
        return "bg-red-500/10 text-red-500";
      case "refunded":
        return "bg-blue-500/10 text-blue-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const filteredOrders = orders.filter(
    (order) =>
      order.recipient.includes(searchQuery) ||
      order.profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.id.toLowerCase().includes(searchQuery.toLowerCase())
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
            placeholder="Search by recipient, user, or order ID..."
            className="pl-10 h-11 rounded-xl"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36 h-11 rounded-xl">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-full sm:w-36 h-11 rounded-xl">
            <SelectValue placeholder="Service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            <SelectItem value="data">Data</SelectItem>
            <SelectItem value="airtime">Airtime</SelectItem>
            <SelectItem value="electricity">Electricity</SelectItem>
            <SelectItem value="cable">Cable TV</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchOrders}
          disabled={isLoading}
          className="h-11 w-11 rounded-xl shrink-0"
        >
          <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
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
                  <TableHead>Service</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {order.profile?.full_name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.profile?.phone_number || order.user_id.substring(0, 8)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {order.service_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{order.recipient}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(order.amount)}
                    </TableCell>
                    <TableCell className="text-right text-green-500 font-medium">
                      {order.profit ? formatCurrency(order.profit) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={order.provider_used === 'smeplug' ? 'border-purple-500 text-purple-600' : 'border-blue-500 text-blue-600'}>
                          {order.provider_used?.toUpperCase() || 'SUBPADI'}
                        </Badge>
                        {order.fallback_attempted && (
                          <span className="text-xs text-muted-foreground">
                            (fallback used)
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(order.created_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedOrder(order)}
                          className="h-8 w-8"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {order.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedOrder(order)}
                            className="h-8 w-8 text-orange-500 hover:text-orange-600"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No orders found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Order ID: {selectedOrder?.id.substring(0, 8)}...
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Service Type</p>
                  <p className="font-medium capitalize">{selectedOrder.service_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Network</p>
                  <p className="font-medium">{selectedOrder.provider}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Recipient</p>
                  <p className="font-medium font-mono">{selectedOrder.recipient}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">API Provider</p>
                  <Badge variant="outline" className={selectedOrder.provider_used === 'smeplug' ? 'border-purple-500 text-purple-600' : 'border-blue-500 text-blue-600'}>
                    {selectedOrder.provider_used?.toUpperCase() || 'SUBPADI'}
                  </Badge>
                  {selectedOrder.fallback_attempted && (
                    <span className="text-xs text-muted-foreground ml-2">(fallback)</span>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={getStatusColor(selectedOrder.status)}>
                    {selectedOrder.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount Charged</p>
                  <p className="font-medium">{formatCurrency(selectedOrder.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cost Price</p>
                  <p className="font-medium">
                    {selectedOrder.cost_price ? formatCurrency(selectedOrder.cost_price) : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Profit</p>
                  <p className="font-medium text-green-500">
                    {selectedOrder.profit ? formatCurrency(selectedOrder.profit) : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {format(new Date(selectedOrder.created_at), "MMM d, yyyy HH:mm")}
                  </p>
                </div>
              </div>

              {selectedOrder.api_response && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">API Response</p>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-32">
                    {JSON.stringify(selectedOrder.api_response, null, 2)}
                  </pre>
                </div>
              )}

              {selectedOrder.status === "failed" && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-orange-500">Refund Available</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        This order failed. You can refund {formatCurrency(selectedOrder.amount)} to
                        the user's wallet.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedOrder(null)}>
              Close
            </Button>
            {selectedOrder?.status === "failed" && (
              <Button onClick={handleRefund} disabled={isRefunding} className="bg-orange-500 hover:bg-orange-600">
                <RotateCcw className="h-4 w-4 mr-2" />
                {isRefunding ? "Processing..." : "Process Refund"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminVTUOrdersTab;
