import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Users,
  Wallet,
  TrendingUp,
  Activity,
  ShoppingCart,
  CreditCard,
  UserCheck,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface AnalyticsData {
  totalUsers: number;
  totalAgents: number;
  totalBalance: number;
  totalTransactions: number;
  totalProfit: number;
  totalRevenue: number;
  successfulOrders: number;
  failedOrders: number;
  pendingOrders: number;
}

interface ChartData {
  date: string;
  revenue: number;
  profit: number;
  transactions: number;
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))"];

const AdminAnalyticsTab = () => {
  const [data, setData] = useState<AnalyticsData>({
    totalUsers: 0,
    totalAgents: 0,
    totalBalance: 0,
    totalTransactions: 0,
    totalProfit: 0,
    totalRevenue: 0,
    successfulOrders: 0,
    failedOrders: 0,
    pendingOrders: 0,
  });
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      // Fetch users count
      const { count: usersCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // Fetch agents count
      const { count: agentsCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_agent", true);

      // Fetch total wallet balance
      const { data: wallets } = await supabase.from("wallets").select("balance");
      const totalBalance = wallets?.reduce((sum, w) => sum + parseFloat(w.balance as unknown as string), 0) || 0;

      // Fetch transactions count
      const { count: txCount } = await supabase
        .from("transactions")
        .select("*", { count: "exact", head: true });

      // Fetch VTU orders for profit/revenue stats
      const { data: orders } = await supabase
        .from("vtu_orders")
        .select("amount, profit, status, created_at");

      const successfulOrders = orders?.filter((o) => o.status === "success") || [];
      const failedOrders = orders?.filter((o) => o.status === "failed") || [];
      const pendingOrders = orders?.filter((o) => o.status === "pending") || [];

      const totalProfit = successfulOrders.reduce(
        (sum, o) => sum + (parseFloat(o.profit as unknown as string) || 0),
        0
      );
      const totalRevenue = successfulOrders.reduce(
        (sum, o) => sum + (parseFloat(o.amount as unknown as string) || 0),
        0
      );

      setData({
        totalUsers: usersCount || 0,
        totalAgents: agentsCount || 0,
        totalBalance,
        totalTransactions: txCount || 0,
        totalProfit,
        totalRevenue,
        successfulOrders: successfulOrders.length,
        failedOrders: failedOrders.length,
        pendingOrders: pendingOrders.length,
      });

      // Generate chart data for last 7 days
      const last7Days: ChartData[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);

        const dayOrders = successfulOrders.filter((o) => {
          const orderDate = new Date(o.created_at);
          return orderDate >= dayStart && orderDate <= dayEnd;
        });

        last7Days.push({
          date: format(date, "MMM d"),
          revenue: dayOrders.reduce((sum, o) => sum + (parseFloat(o.amount as unknown as string) || 0), 0),
          profit: dayOrders.reduce((sum, o) => sum + (parseFloat(o.profit as unknown as string) || 0), 0),
          transactions: dayOrders.length,
        });
      }
      setChartData(last7Days);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const statCards = [
    { title: "Total Users", value: data.totalUsers.toLocaleString(), icon: Users, color: "bg-blue-500" },
    { title: "Total Agents", value: data.totalAgents.toLocaleString(), icon: UserCheck, color: "bg-indigo-500" },
    { title: "Total Balance", value: formatCurrency(data.totalBalance), icon: Wallet, color: "bg-green-500" },
    { title: "Transactions", value: data.totalTransactions.toLocaleString(), icon: Activity, color: "bg-purple-500" },
    { title: "Total Revenue", value: formatCurrency(data.totalRevenue), icon: CreditCard, color: "bg-cyan-500" },
    { title: "Total Profit", value: formatCurrency(data.totalProfit), icon: TrendingUp, color: "bg-orange-500" },
    { title: "Successful Orders", value: data.successfulOrders.toLocaleString(), icon: ShoppingCart, color: "bg-emerald-500" },
    { title: "Failed Orders", value: data.failedOrders.toLocaleString(), icon: ShoppingCart, color: "bg-red-500" },
  ];

  const pieData = [
    { name: "Successful", value: data.successfulOrders },
    { name: "Failed", value: data.failedOrders },
    { name: "Pending", value: data.pendingOrders },
  ];

  return (
    <div className="space-y-6">
      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={fetchAnalytics} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass-card rounded-2xl p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center`}>
                <stat.icon className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate">{stat.title}</p>
                <p className="font-bold text-lg truncate">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-4">
          <h3 className="font-semibold mb-4">Revenue & Profit (Last 7 Days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stackId="1"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary) / 0.3)"
                  name="Revenue"
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stackId="2"
                  stroke="hsl(142 76% 36%)"
                  fill="hsl(142 76% 36% / 0.3)"
                  name="Profit"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Status Pie Chart */}
        <div className="glass-card rounded-2xl p-4">
          <h3 className="font-semibold mb-4">Order Status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {pieData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                <span>{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalyticsTab;
