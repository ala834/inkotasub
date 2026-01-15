import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Download,
  RefreshCw,
  Calendar,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import {
  format,
  subDays,
  subWeeks,
  subMonths,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
} from "date-fns";
import { toast } from "sonner";

interface ProfitData {
  label: string;
  profit: number;
  revenue: number;
  orders: number;
  costPrice: number;
}

interface ServiceBreakdown {
  service: string;
  profit: number;
  revenue: number;
  orders: number;
}

interface NetworkBreakdown {
  network: string;
  profit: number;
  revenue: number;
  orders: number;
}

type TimeRange = "7days" | "30days" | "3months" | "6months" | "1year";

const AdminProfitAnalyticsTab = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>("30days");
  const [activeTab, setActiveTab] = useState("daily");
  const [isLoading, setIsLoading] = useState(true);
  const [dailyData, setDailyData] = useState<ProfitData[]>([]);
  const [weeklyData, setWeeklyData] = useState<ProfitData[]>([]);
  const [monthlyData, setMonthlyData] = useState<ProfitData[]>([]);
  const [serviceBreakdown, setServiceBreakdown] = useState<ServiceBreakdown[]>([]);
  const [networkBreakdown, setNetworkBreakdown] = useState<NetworkBreakdown[]>([]);
  const [totals, setTotals] = useState({
    totalProfit: 0,
    totalRevenue: 0,
    totalOrders: 0,
    avgProfit: 0,
    profitMargin: 0,
    growthRate: 0,
  });

  useEffect(() => {
    fetchProfitData();
  }, [timeRange]);

  const getDateRange = () => {
    const now = new Date();
    switch (timeRange) {
      case "7days":
        return { start: subDays(now, 7), end: now };
      case "30days":
        return { start: subDays(now, 30), end: now };
      case "3months":
        return { start: subMonths(now, 3), end: now };
      case "6months":
        return { start: subMonths(now, 6), end: now };
      case "1year":
        return { start: subMonths(now, 12), end: now };
      default:
        return { start: subDays(now, 30), end: now };
    }
  };

  const fetchProfitData = async () => {
    setIsLoading(true);
    try {
      const { start, end } = getDateRange();

      const { data: orders, error } = await supabase
        .from("vtu_orders")
        .select("*")
        .eq("status", "success")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Calculate totals
      const totalProfit = orders?.reduce((sum, o) => sum + (o.profit || 0), 0) || 0;
      const totalRevenue = orders?.reduce((sum, o) => sum + o.amount, 0) || 0;
      const totalCost = orders?.reduce((sum, o) => sum + (o.cost_price || 0), 0) || 0;
      const totalOrders = orders?.length || 0;

      // Calculate previous period for growth rate
      const previousStart = subDays(start, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      const { data: previousOrders } = await supabase
        .from("vtu_orders")
        .select("profit")
        .eq("status", "success")
        .gte("created_at", previousStart.toISOString())
        .lt("created_at", start.toISOString());

      const previousProfit = previousOrders?.reduce((sum, o) => sum + (o.profit || 0), 0) || 0;
      const growthRate = previousProfit > 0 ? ((totalProfit - previousProfit) / previousProfit) * 100 : 0;

      setTotals({
        totalProfit,
        totalRevenue,
        totalOrders,
        avgProfit: totalOrders > 0 ? totalProfit / totalOrders : 0,
        profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        growthRate,
      });

      // Daily breakdown
      const days = eachDayOfInterval({ start, end });
      const dailyBreakdown = days.map((day) => {
        const dayOrders = orders?.filter((o) => {
          const orderDate = new Date(o.created_at);
          return orderDate >= startOfDay(day) && orderDate <= endOfDay(day);
        }) || [];

        return {
          label: format(day, "MMM d"),
          profit: dayOrders.reduce((sum, o) => sum + (o.profit || 0), 0),
          revenue: dayOrders.reduce((sum, o) => sum + o.amount, 0),
          orders: dayOrders.length,
          costPrice: dayOrders.reduce((sum, o) => sum + (o.cost_price || 0), 0),
        };
      });
      setDailyData(dailyBreakdown);

      // Weekly breakdown
      const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
      const weeklyBreakdown = weeks.map((week) => {
        const weekStart = startOfWeek(week, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(week, { weekStartsOn: 1 });
        const weekOrders = orders?.filter((o) => {
          const orderDate = new Date(o.created_at);
          return orderDate >= weekStart && orderDate <= weekEnd;
        }) || [];

        return {
          label: `Week ${format(week, "w")} (${format(weekStart, "MMM d")})`,
          profit: weekOrders.reduce((sum, o) => sum + (o.profit || 0), 0),
          revenue: weekOrders.reduce((sum, o) => sum + o.amount, 0),
          orders: weekOrders.length,
          costPrice: weekOrders.reduce((sum, o) => sum + (o.cost_price || 0), 0),
        };
      });
      setWeeklyData(weeklyBreakdown);

      // Monthly breakdown
      const months = eachMonthOfInterval({ start, end });
      const monthlyBreakdown = months.map((month) => {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const monthOrders = orders?.filter((o) => {
          const orderDate = new Date(o.created_at);
          return orderDate >= monthStart && orderDate <= monthEnd;
        }) || [];

        return {
          label: format(month, "MMMM yyyy"),
          profit: monthOrders.reduce((sum, o) => sum + (o.profit || 0), 0),
          revenue: monthOrders.reduce((sum, o) => sum + o.amount, 0),
          orders: monthOrders.length,
          costPrice: monthOrders.reduce((sum, o) => sum + (o.cost_price || 0), 0),
        };
      });
      setMonthlyData(monthlyBreakdown);

      // Service breakdown
      const serviceMap = new Map<string, ServiceBreakdown>();
      orders?.forEach((o) => {
        const existing = serviceMap.get(o.service_type) || { service: o.service_type, profit: 0, revenue: 0, orders: 0 };
        serviceMap.set(o.service_type, {
          ...existing,
          profit: existing.profit + (o.profit || 0),
          revenue: existing.revenue + o.amount,
          orders: existing.orders + 1,
        });
      });
      setServiceBreakdown(Array.from(serviceMap.values()));

      // Network breakdown
      const networkMap = new Map<string, NetworkBreakdown>();
      orders?.forEach((o) => {
        const existing = networkMap.get(o.provider) || { network: o.provider, profit: 0, revenue: 0, orders: 0 };
        networkMap.set(o.provider, {
          ...existing,
          profit: existing.profit + (o.profit || 0),
          revenue: existing.revenue + o.amount,
          orders: existing.orders + 1,
        });
      });
      setNetworkBreakdown(Array.from(networkMap.values()));

    } catch (error) {
      console.error("Failed to fetch profit data:", error);
      toast.error("Failed to fetch profit data");
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

  const exportToCSV = (type: "daily" | "weekly" | "monthly" | "service" | "network") => {
    let data: any[] = [];
    let filename = "";
    let headers: string[] = [];

    switch (type) {
      case "daily":
        data = dailyData;
        filename = `profit-daily-${format(new Date(), "yyyy-MM-dd")}.csv`;
        headers = ["Date", "Profit (NGN)", "Revenue (NGN)", "Cost (NGN)", "Orders"];
        break;
      case "weekly":
        data = weeklyData;
        filename = `profit-weekly-${format(new Date(), "yyyy-MM-dd")}.csv`;
        headers = ["Week", "Profit (NGN)", "Revenue (NGN)", "Cost (NGN)", "Orders"];
        break;
      case "monthly":
        data = monthlyData;
        filename = `profit-monthly-${format(new Date(), "yyyy-MM-dd")}.csv`;
        headers = ["Month", "Profit (NGN)", "Revenue (NGN)", "Cost (NGN)", "Orders"];
        break;
      case "service":
        data = serviceBreakdown;
        filename = `profit-by-service-${format(new Date(), "yyyy-MM-dd")}.csv`;
        headers = ["Service", "Profit (NGN)", "Revenue (NGN)", "Orders"];
        break;
      case "network":
        data = networkBreakdown;
        filename = `profit-by-network-${format(new Date(), "yyyy-MM-dd")}.csv`;
        headers = ["Network/Provider", "Profit (NGN)", "Revenue (NGN)", "Orders"];
        break;
    }

    const csvContent = [
      headers.join(","),
      ...data.map((row) => {
        if (type === "service") {
          return [row.service, row.profit, row.revenue, row.orders].join(",");
        } else if (type === "network") {
          return [row.network, row.profit, row.revenue, row.orders].join(",");
        } else {
          return [row.label, row.profit, row.revenue, row.costPrice, row.orders].join(",");
        }
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    toast.success(`Exported ${filename}`);
  };

  const exportFullReport = () => {
    const reportData = {
      generatedAt: new Date().toISOString(),
      timeRange,
      summary: totals,
      dailyBreakdown: dailyData,
      weeklyBreakdown: weeklyData,
      monthlyBreakdown: monthlyData,
      serviceBreakdown,
      networkBreakdown,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `profit-report-${format(new Date(), "yyyy-MM-dd")}.json`;
    link.click();
    toast.success("Full report exported successfully");
  };

  const statCards = [
    {
      title: "Total Profit",
      value: formatCurrency(totals.totalProfit),
      icon: TrendingUp,
      color: "bg-green-500",
      change: totals.growthRate,
    },
    {
      title: "Total Revenue",
      value: formatCurrency(totals.totalRevenue),
      icon: DollarSign,
      color: "bg-blue-500",
    },
    {
      title: "Profit Margin",
      value: `${totals.profitMargin.toFixed(1)}%`,
      icon: BarChart3,
      color: "bg-purple-500",
    },
    {
      title: "Avg Profit/Order",
      value: formatCurrency(totals.avgProfit),
      icon: Calendar,
      color: "bg-orange-500",
    },
  ];

  const getActiveData = () => {
    switch (activeTab) {
      case "daily":
        return dailyData;
      case "weekly":
        return weeklyData;
      case "monthly":
        return monthlyData;
      default:
        return dailyData;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="1year">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchProfitData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <Button onClick={exportFullReport} className="gap-2">
          <Download className="h-4 w-4" />
          Export Full Report
        </Button>
      </div>

      {/* Summary Stats */}
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
                {stat.change !== undefined && (
                  <div className={`flex items-center text-xs ${stat.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {stat.change >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    <span>{Math.abs(stat.change).toFixed(1)}% vs prev period</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Time-Based Breakdown Tabs */}
      <div className="glass-card rounded-2xl p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <TabsList>
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(activeTab as "daily" | "weekly" | "monthly")}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <TabsContent value="daily" className="mt-0">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke="hsl(142 76% 36%)"
                    fill="hsl(142 76% 36% / 0.3)"
                    name="Profit"
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.2)"
                    name="Revenue"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="weekly" className="mt-0">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="profit" fill="hsl(142 76% 36%)" name="Profit" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="monthly" className="mt-0">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    stroke="hsl(142 76% 36%)"
                    strokeWidth={3}
                    dot={{ fill: "hsl(142 76% 36%)" }}
                    name="Profit"
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ fill: "hsl(var(--primary))" }}
                    name="Revenue"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Breakdown by Service and Network */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Service Breakdown */}
        <div className="glass-card rounded-2xl p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Profit by Service</h3>
            <Button variant="ghost" size="sm" onClick={() => exportToCSV("service")}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serviceBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} className="text-xs" />
                <YAxis dataKey="service" type="category" className="text-xs" width={80} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="profit" fill="hsl(142 76% 36%)" name="Profit" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Network Breakdown */}
        <div className="glass-card rounded-2xl p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Profit by Network/Provider</h3>
            <Button variant="ghost" size="sm" onClick={() => exportToCSV("network")}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={networkBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} className="text-xs" />
                <YAxis dataKey="network" type="category" className="text-xs" width={80} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="profit" fill="hsl(var(--primary))" name="Profit" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Data Table */}
      <div className="glass-card rounded-2xl p-4">
        <h3 className="font-semibold mb-4">
          {activeTab === "daily" ? "Daily" : activeTab === "weekly" ? "Weekly" : "Monthly"} Breakdown Details
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-2 font-medium text-muted-foreground">Period</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">Cost</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">Profit</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">Margin</th>
                <th className="text-right py-3 px-2 font-medium text-muted-foreground">Orders</th>
              </tr>
            </thead>
            <tbody>
              {getActiveData().slice(-10).reverse().map((row, idx) => (
                <tr key={idx} className="border-b border-border/50 hover:bg-muted/50">
                  <td className="py-3 px-2 font-medium">{row.label}</td>
                  <td className="py-3 px-2 text-right">{formatCurrency(row.revenue)}</td>
                  <td className="py-3 px-2 text-right">{formatCurrency(row.costPrice)}</td>
                  <td className="py-3 px-2 text-right text-green-600 font-medium">{formatCurrency(row.profit)}</td>
                  <td className="py-3 px-2 text-right">
                    {row.revenue > 0 ? ((row.profit / row.revenue) * 100).toFixed(1) : 0}%
                  </td>
                  <td className="py-3 px-2 text-right">{row.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminProfitAnalyticsTab;
