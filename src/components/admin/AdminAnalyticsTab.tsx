import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Users, Wallet, TrendingUp, Activity, ShoppingCart, CreditCard,
  UserCheck, RefreshCw, Clock, Zap, AlertTriangle, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
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

interface ProviderMetrics {
  provider: string;
  avgLatency: number;
  successRate: number;
  totalCalls: number;
  failures: number;
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
    totalUsers: 0, totalAgents: 0, totalBalance: 0, totalTransactions: 0,
    totalProfit: 0, totalRevenue: 0, successfulOrders: 0, failedOrders: 0, pendingOrders: 0,
  });
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [providerMetrics, setProviderMetrics] = useState<ProviderMetrics[]>([]);
  const [fraudCount, setFraudCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { fetchAnalytics(); }, []);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const [
        { count: usersCount },
        { count: agentsCount },
        { data: wallets },
        { count: txCount },
        { data: orders },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_agent", true),
        supabase.from("wallets").select("balance"),
        supabase.from("transactions").select("*", { count: "exact", head: true }),
        supabase.from("vtu_orders").select("amount, profit, status, created_at"),
      ]);

      const totalBalance = wallets?.reduce((sum, w) => sum + parseFloat(w.balance as unknown as string), 0) || 0;
      const successfulOrders = orders?.filter((o) => o.status === "success") || [];
      const failedOrders = orders?.filter((o) => o.status === "failed") || [];
      const pendingOrders = orders?.filter((o) => o.status === "pending") || [];

      const totalProfit = successfulOrders.reduce((sum, o) => sum + (parseFloat(o.profit as unknown as string) || 0), 0);
      const totalRevenue = successfulOrders.reduce((sum, o) => sum + (parseFloat(o.amount as unknown as string) || 0), 0);

      setData({
        totalUsers: usersCount || 0, totalAgents: agentsCount || 0, totalBalance,
        totalTransactions: txCount || 0, totalProfit, totalRevenue,
        successfulOrders: successfulOrders.length, failedOrders: failedOrders.length, pendingOrders: pendingOrders.length,
      });

      // Chart data for last 7 days
      const last7Days: ChartData[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);
        const dayOrders = successfulOrders.filter((o) => {
          const d = new Date(o.created_at);
          return d >= dayStart && d <= dayEnd;
        });
        last7Days.push({
          date: format(date, "MMM d"),
          revenue: dayOrders.reduce((sum, o) => sum + (parseFloat(o.amount as unknown as string) || 0), 0),
          profit: dayOrders.reduce((sum, o) => sum + (parseFloat(o.profit as unknown as string) || 0), 0),
          transactions: dayOrders.length,
        });
      }
      setChartData(last7Days);

      // Fetch provider metrics (last 24h)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: metrics } = await supabase
        .from("provider_metrics" as any)
        .select("provider, response_time_ms, success")
        .gte("created_at", oneDayAgo);

      if (metrics && metrics.length > 0) {
        const grouped = new Map<string, { latencies: number[]; successes: number; total: number }>();
        for (const m of metrics as any[]) {
          const key = m.provider;
          if (!grouped.has(key)) grouped.set(key, { latencies: [], successes: 0, total: 0 });
          const g = grouped.get(key)!;
          g.total++;
          if (m.success) g.successes++;
          if (m.response_time_ms) g.latencies.push(m.response_time_ms);
        }
        const pMetrics: ProviderMetrics[] = [];
        for (const [provider, g] of grouped) {
          pMetrics.push({
            provider,
            avgLatency: g.latencies.length > 0 ? Math.round(g.latencies.reduce((a, b) => a + b, 0) / g.latencies.length) : 0,
            successRate: g.total > 0 ? Math.round((g.successes / g.total) * 100) : 0,
            totalCalls: g.total,
            failures: g.total - g.successes,
          });
        }
        setProviderMetrics(pMetrics);
      }

      // Fraud flags count
      const { count: fCount } = await supabase
        .from("fraud_flags" as any)
        .select("*", { count: "exact", head: true })
        .eq("resolved", false);
      setFraudCount(fCount || 0);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(amount);

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

  const successRate = data.successfulOrders + data.failedOrders > 0
    ? Math.round((data.successfulOrders / (data.successfulOrders + data.failedOrders)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-3">
          {/* Quick health indicators */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-medium">
            <Zap className="h-3 w-3" />
            Success: {successRate}%
          </div>
          {data.pendingOrders > 0 && (
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-500 text-xs font-medium">
              <Clock className="h-3 w-3" />
              {data.pendingOrders} Pending
            </div>
          )}
          {fraudCount > 0 && (
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 text-xs font-medium">
              <AlertTriangle className="h-3 w-3" />
              {fraudCount} Fraud Flags
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchAnalytics} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="glass-card rounded-2xl p-4">
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

      {/* Provider Performance */}
      {providerMetrics.length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Provider Performance (Last 24h)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providerMetrics.map((pm) => (
              <div key={pm.provider} className="border border-border rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium capitalize">{pm.provider}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${pm.successRate >= 90 ? 'bg-emerald-500/10 text-emerald-500' : pm.successRate >= 70 ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500'}`}>
                    {pm.successRate}% success
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>
                    <p className="font-medium text-foreground">{pm.avgLatency}ms</p>
                    <p>Avg Latency</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{pm.totalCalls}</p>
                    <p>Total Calls</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{pm.failures}</p>
                    <p>Failures</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card rounded-2xl p-4">
          <h3 className="font-semibold mb-4">Revenue & Profit (Last 7 Days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Area type="monotone" dataKey="revenue" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.3)" name="Revenue" />
                <Area type="monotone" dataKey="profit" stackId="2" stroke="hsl(142 76% 36%)" fill="hsl(142 76% 36% / 0.3)" name="Profit" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4">
          <h3 className="font-semibold mb-4">Order Status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
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
