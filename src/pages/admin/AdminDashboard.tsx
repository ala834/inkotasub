import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Wallet,
  Activity,
  Settings,
  RefreshCw,
  DollarSign,
  UserCheck,
  Gift,
  ShoppingCart,
  ArrowLeft,
  Banknote,
  Shield,
  TrendingUp,
  Webhook,
  Building2,
  ClipboardList,
  Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import AdminAnalyticsTab from "@/components/admin/AdminAnalyticsTab";
import AdminUserManagementTab from "@/components/admin/AdminUserManagementTab";
import AdminAgentsTab from "@/components/admin/AdminAgentsTab";
import AdminTransactionsTab from "@/components/admin/AdminTransactionsTab";
import AdminVTUOrdersTab from "@/components/admin/AdminVTUOrdersTab";
import AdminWalletsTab from "@/components/admin/AdminWalletsTab";
import AdminPricingTab from "@/components/admin/AdminPricingTab";
import AdminSettingsTab from "@/components/admin/AdminSettingsTab";
import AdminProfitAnalyticsTab from "@/components/admin/AdminProfitAnalyticsTab";
import AdminWebhooksTab from "@/components/admin/AdminWebhooksTab";
import AdminVirtualAccountsTab from "@/components/admin/AdminVirtualAccountsTab";
import AdminActivityLogTab from "@/components/admin/AdminActivityLogTab";
import AdminServicesTab from "@/components/admin/AdminServicesTab";
import AdminProfitWithdrawalTab from "@/components/admin/AdminProfitWithdrawalTab";
import AdminReferralsTab from "@/components/admin/AdminReferralsTab";
import AdminDevicesTab from "@/components/admin/AdminDevicesTab";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { signOut, isAdmin, isLoading: authLoading } = useAuth();

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/dashboard");
    }
  }, [isAdmin, authLoading, navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const tabs = [
    { value: "analytics", label: "Dashboard", icon: LayoutDashboard },
    { value: "profit", label: "Profit Analytics", icon: TrendingUp },
    { value: "withdrawals", label: "Withdrawals", icon: Banknote },
    { value: "services", label: "Services", icon: Package },
    { value: "users", label: "Users", icon: Users },
    { value: "agents", label: "Agents", icon: UserCheck },
    { value: "transactions", label: "Transactions", icon: Activity },
    { value: "orders", label: "VTU Orders", icon: ShoppingCart },
    { value: "wallets", label: "Wallets", icon: Wallet },
    { value: "virtual-accounts", label: "Virtual Accounts", icon: Building2 },
    { value: "webhooks", label: "Webhooks", icon: Webhook },
    { value: "activity", label: "Activity Log", icon: ClipboardList },
    { value: "devices", label: "Devices", icon: Shield },
    { value: "referrals", label: "Referrals", icon: Gift },
    { value: "pricing", label: "Pricing", icon: DollarSign },
    { value: "settings", label: "Settings", icon: Settings },
  ];

  if (authLoading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen gradient-hero">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dashboard")}
              className="rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
                <Shield className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-lg">
                Admin Panel
              </span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="analytics" className="space-y-6">
          {/* Scrollable Tab Navigation */}
          <ScrollArea className="w-full whitespace-nowrap">
            <TabsList className="inline-flex h-12 items-center justify-start rounded-xl bg-muted p-1 w-auto min-w-full">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>

          <TabsContent value="analytics">
            <AdminAnalyticsTab />
          </TabsContent>

          <TabsContent value="profit">
            <AdminProfitAnalyticsTab />
          </TabsContent>

          <TabsContent value="withdrawals">
            <AdminProfitWithdrawalTab />
          </TabsContent>

          <TabsContent value="services">
            <AdminServicesTab />
          </TabsContent>

          <TabsContent value="users">
            <AdminUserManagementTab />
          </TabsContent>

          <TabsContent value="agents">
            <AdminAgentsTab />
          </TabsContent>

          <TabsContent value="transactions">
            <AdminTransactionsTab />
          </TabsContent>

          <TabsContent value="orders">
            <AdminVTUOrdersTab />
          </TabsContent>

          <TabsContent value="wallets">
            <AdminWalletsTab />
          </TabsContent>

          <TabsContent value="virtual-accounts">
            <AdminVirtualAccountsTab />
          </TabsContent>

          <TabsContent value="webhooks">
            <AdminWebhooksTab />
          </TabsContent>

          <TabsContent value="activity">
            <AdminActivityLogTab />
          </TabsContent>

          <TabsContent value="devices">
            <AdminDevicesTab />
          </TabsContent>

          <TabsContent value="referrals">
            <AdminReferralsTab />
          </TabsContent>

          <TabsContent value="pricing">
            <AdminPricingTab />
          </TabsContent>

          <TabsContent value="settings">
            <AdminSettingsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
