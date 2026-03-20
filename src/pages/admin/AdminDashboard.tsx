import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  Wallet,
  Activity,
  Settings,
  DollarSign,
  UserCheck,
  Gift,
  ShoppingCart,
  ArrowLeft,
  Banknote,
  Shield,
  ShieldCheck,
  TrendingUp,
  Webhook,
  Building2,
  ClipboardList,
  Package,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import AdminKYCTab from "@/components/admin/AdminKYCTab";
import AdminManagementTab from "@/components/admin/AdminManagementTab";

type TabDef = {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  superOnly?: boolean;
};

const allTabs: TabDef[] = [
  { value: "analytics", label: "Dashboard", icon: LayoutDashboard },
  { value: "profit", label: "Profit Analytics", icon: TrendingUp, superOnly: true },
  { value: "withdrawals", label: "Withdrawals", icon: Banknote, superOnly: true },
  { value: "services", label: "Services", icon: Package, superOnly: true },
  { value: "users", label: "Users", icon: Users, superOnly: true },
  { value: "agents", label: "Agents", icon: UserCheck, superOnly: true },
  { value: "transactions", label: "Transactions", icon: Activity },
  { value: "orders", label: "VTU Orders", icon: ShoppingCart },
  { value: "wallets", label: "Wallets", icon: Wallet, superOnly: true },
  { value: "virtual-accounts", label: "Virtual Accounts", icon: Building2, superOnly: true },
  { value: "webhooks", label: "Webhooks", icon: Webhook, superOnly: true },
  { value: "activity", label: "Activity Log", icon: ClipboardList },
  { value: "devices", label: "Devices", icon: Shield, superOnly: true },
  { value: "kyc", label: "KYC", icon: ShieldCheck, superOnly: true },
  { value: "referrals", label: "Referrals", icon: Gift },
  { value: "pricing", label: "Pricing", icon: DollarSign, superOnly: true },
  { value: "admin-team", label: "Admin Team", icon: UserCog, superOnly: true },
  { value: "settings", label: "Settings", icon: Settings, superOnly: true },
];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { signOut, isAdmin, isSuperAdmin, adminRole, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/dashboard");
    }
  }, [isAdmin, authLoading, navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const visibleTabs = allTabs.filter(tab => !tab.superOnly || isSuperAdmin);

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
              <span className="font-display font-bold text-lg">Admin Panel</span>
              <Badge
                variant={isSuperAdmin ? "default" : "secondary"}
                className="gap-1 text-[10px] px-2 py-0.5"
              >
                {isSuperAdmin ? (
                  <><ShieldCheck className="h-3 w-3" /> Super Admin</>
                ) : (
                  <><Shield className="h-3 w-3" /> Sub Admin</>
                )}
              </Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="analytics" className="space-y-6">
          <ScrollArea className="w-full whitespace-nowrap">
            <TabsList className="inline-flex h-12 items-center justify-start rounded-xl bg-muted p-1 w-auto min-w-full">
              {visibleTabs.map((tab) => (
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

          <TabsContent value="analytics"><AdminAnalyticsTab /></TabsContent>
          {isSuperAdmin && <TabsContent value="profit"><AdminProfitAnalyticsTab /></TabsContent>}
          {isSuperAdmin && <TabsContent value="withdrawals"><AdminProfitWithdrawalTab /></TabsContent>}
          {isSuperAdmin && <TabsContent value="services"><AdminServicesTab /></TabsContent>}
          {isSuperAdmin && <TabsContent value="users"><AdminUserManagementTab /></TabsContent>}
          {isSuperAdmin && <TabsContent value="agents"><AdminAgentsTab /></TabsContent>}
          <TabsContent value="transactions"><AdminTransactionsTab /></TabsContent>
          <TabsContent value="orders"><AdminVTUOrdersTab /></TabsContent>
          {isSuperAdmin && <TabsContent value="wallets"><AdminWalletsTab /></TabsContent>}
          {isSuperAdmin && <TabsContent value="virtual-accounts"><AdminVirtualAccountsTab /></TabsContent>}
          {isSuperAdmin && <TabsContent value="webhooks"><AdminWebhooksTab /></TabsContent>}
          <TabsContent value="activity"><AdminActivityLogTab /></TabsContent>
          {isSuperAdmin && <TabsContent value="devices"><AdminDevicesTab /></TabsContent>}
          {isSuperAdmin && <TabsContent value="kyc"><AdminKYCTab /></TabsContent>}
          <TabsContent value="referrals"><AdminReferralsTab /></TabsContent>
          {isSuperAdmin && <TabsContent value="pricing"><AdminPricingTab /></TabsContent>}
          {isSuperAdmin && <TabsContent value="admin-team"><AdminManagementTab /></TabsContent>}
          {isSuperAdmin && <TabsContent value="settings"><AdminSettingsTab /></TabsContent>}
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
