import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, User, Users, TrendingUp, ShoppingCart, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface ProfileWithStats {
  id: string;
  user_id: string;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  is_agent: boolean | null;
  created_at: string;
  total_orders: number;
  total_profit: number;
  total_revenue: number;
}

interface AgentStats {
  totalAgents: number;
  totalAgentOrders: number;
  totalAgentProfit: number;
  totalAgentRevenue: number;
}

const AdminAgentsTab = () => {
  const [users, setUsers] = useState<ProfileWithStats[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [stats, setStats] = useState<AgentStats>({
    totalAgents: 0,
    totalAgentOrders: 0,
    totalAgentProfit: 0,
    totalAgentRevenue: 0,
  });

  useEffect(() => {
    fetchUsersWithStats();
  }, []);

  const fetchUsersWithStats = async () => {
    setIsLoading(true);
    try {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch VTU orders for stats
      const { data: orders, error: ordersError } = await supabase
        .from("vtu_orders")
        .select("user_id, amount, profit, status");

      if (ordersError) throw ordersError;

      // Calculate stats per user
      const userStats = new Map<string, { orders: number; profit: number; revenue: number }>();
      orders?.forEach((order) => {
        const current = userStats.get(order.user_id) || { orders: 0, profit: 0, revenue: 0 };
        if (order.status === "success") {
          current.orders += 1;
          current.profit += parseFloat(order.profit as unknown as string) || 0;
          current.revenue += parseFloat(order.amount as unknown as string) || 0;
        }
        userStats.set(order.user_id, current);
      });

      const usersWithStats: ProfileWithStats[] = (profiles || []).map((profile) => {
        const stats = userStats.get(profile.user_id) || { orders: 0, profit: 0, revenue: 0 };
        return {
          ...profile,
          total_orders: stats.orders,
          total_profit: stats.profit,
          total_revenue: stats.revenue,
        };
      });

      setUsers(usersWithStats);

      // Calculate agent-only stats
      const agents = usersWithStats.filter((u) => u.is_agent);
      setStats({
        totalAgents: agents.length,
        totalAgentOrders: agents.reduce((sum, a) => sum + a.total_orders, 0),
        totalAgentProfit: agents.reduce((sum, a) => sum + a.total_profit, 0),
        totalAgentRevenue: agents.reduce((sum, a) => sum + a.total_revenue, 0),
      });
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast.error("Failed to fetch users");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAgentStatus = async (userId: string, currentStatus: boolean | null) => {
    setUpdatingUserId(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_agent: !currentStatus })
        .eq("user_id", userId);

      if (error) throw error;

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId ? { ...u, is_agent: !currentStatus } : u
        )
      );

      // Update stats
      const updatedUsers = users.map((u) =>
        u.user_id === userId ? { ...u, is_agent: !currentStatus } : u
      );
      const agents = updatedUsers.filter((u) => u.is_agent);
      setStats({
        totalAgents: agents.length,
        totalAgentOrders: agents.reduce((sum, a) => sum + a.total_orders, 0),
        totalAgentProfit: agents.reduce((sum, a) => sum + a.total_profit, 0),
        totalAgentRevenue: agents.reduce((sum, a) => sum + a.total_revenue, 0),
      });

      toast.success(
        !currentStatus
          ? "User promoted to agent"
          : "User demoted from agent"
      );
    } catch (error) {
      console.error("Failed to update agent status:", error);
      toast.error("Failed to update agent status");
    } finally {
      setUpdatingUserId(null);
    }
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
      u.phone_number?.includes(searchQuery)
  );

  const statCards = [
    {
      title: "Total Agents",
      value: stats.totalAgents.toLocaleString(),
      icon: Users,
      color: "bg-blue-500",
    },
    {
      title: "Agent Orders",
      value: stats.totalAgentOrders.toLocaleString(),
      icon: ShoppingCart,
      color: "bg-purple-500",
    },
    {
      title: "Agent Revenue",
      value: formatCurrency(stats.totalAgentRevenue),
      icon: TrendingUp,
      color: "bg-green-500",
    },
    {
      title: "Agent Profit",
      value: formatCurrency(stats.totalAgentProfit),
      icon: TrendingUp,
      color: "bg-orange-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Agent Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-card rounded-2xl p-4"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center`}
              >
                <stat.icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.title}</p>
                <p className="font-bold text-lg">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search and Refresh */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users to manage agents..."
            className="pl-10 h-12 rounded-xl"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchUsersWithStats}
          disabled={isLoading}
          className="h-12 w-12 rounded-xl"
        >
          <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Users Table */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-center">Agent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
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
                        <p className="font-medium">
                          {user.full_name || "No name"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {user.phone_number || "No phone"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.is_agent ? "default" : "secondary"}
                      className={
                        user.is_agent
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : ""
                      }
                    >
                      {user.is_agent ? "Agent" : "User"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {user.total_orders}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(user.total_revenue)}
                  </TableCell>
                  <TableCell className="text-right text-green-500 font-medium">
                    {formatCurrency(user.total_profit)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={user.is_agent || false}
                      onCheckedChange={() =>
                        toggleAgentStatus(user.user_id, user.is_agent)
                      }
                      disabled={updatingUserId === user.user_id}
                    />
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
      )}
    </div>
  );
};

export default AdminAgentsTab;
