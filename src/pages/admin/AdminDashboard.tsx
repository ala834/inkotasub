import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Wallet,
  TrendingUp,
  Activity,
  Settings,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  DollarSign,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminUsersTab from "@/components/admin/AdminUsersTab";
import AdminTransactionsTab from "@/components/admin/AdminTransactionsTab";
import AdminWalletsTab from "@/components/admin/AdminWalletsTab";
import AdminPricingTab from "@/components/admin/AdminPricingTab";
import AdminAgentsTab from "@/components/admin/AdminAgentsTab";

interface DashboardStats {
  totalUsers: number;
  totalBalance: number;
  totalTransactions: number;
  totalProfit: number;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalBalance: 0,
    totalTransactions: 0,
    totalProfit: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      // Fetch users count
      const { count: usersCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // Fetch total wallet balance
      const { data: wallets } = await supabase.from("wallets").select("balance");
      const totalBalance = wallets?.reduce((sum, w) => sum + parseFloat(w.balance as unknown as string), 0) || 0;

      // Fetch transactions count
      const { count: txCount } = await supabase
        .from("transactions")
        .select("*", { count: "exact", head: true });

      // Fetch profit from VTU orders
      const { data: orders } = await supabase.from("vtu_orders").select("profit");
      const totalProfit = orders?.reduce((sum, o) => sum + (parseFloat(o.profit as unknown as string) || 0), 0) || 0;

      setStats({
        totalUsers: usersCount || 0,
        totalBalance,
        totalTransactions: txCount || 0,
        totalProfit,
      });
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const statCards = [
    {
      title: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      icon: Users,
      color: "bg-blue-500",
    },
    {
      title: "Total Balance",
      value: formatCurrency(stats.totalBalance),
      icon: Wallet,
      color: "bg-green-500",
    },
    {
      title: "Transactions",
      value: stats.totalTransactions.toLocaleString(),
      icon: Activity,
      color: "bg-purple-500",
    },
    {
      title: "Total Profit",
      value: formatCurrency(stats.totalProfit),
      icon: TrendingUp,
      color: "bg-orange-500",
    },
  ];

  return (
    <div className="min-h-screen gradient-hero">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">I</span>
            </div>
            <span className="font-display font-bold text-lg">
              Admin Dashboard
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchStats}
              className="rounded-full"
            >
              <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

        {/* Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5 h-12 rounded-xl">
            <TabsTrigger value="users" className="rounded-lg">
              Users
            </TabsTrigger>
            <TabsTrigger value="agents" className="rounded-lg">
              Agents
            </TabsTrigger>
            <TabsTrigger value="transactions" className="rounded-lg">
              Transactions
            </TabsTrigger>
            <TabsTrigger value="wallets" className="rounded-lg">
              Wallets
            </TabsTrigger>
            <TabsTrigger value="pricing" className="rounded-lg">
              Pricing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <AdminUsersTab />
          </TabsContent>

          <TabsContent value="agents">
            <AdminAgentsTab />
          </TabsContent>

          <TabsContent value="transactions">
            <AdminTransactionsTab />
          </TabsContent>

          <TabsContent value="wallets">
            <AdminWalletsTab />
          </TabsContent>

          <TabsContent value="pricing">
            <AdminPricingTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
