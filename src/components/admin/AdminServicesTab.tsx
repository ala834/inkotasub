import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Smartphone, Signal, Tv, Zap, Settings2, Database } from "lucide-react";
import AdminDataPlansTab from "./services/AdminDataPlansTab";
import AdminAirtimePricingTab from "./services/AdminAirtimePricingTab";
import AdminCableTVTab from "./services/AdminCableTVTab";
import AdminElectricityTab from "./services/AdminElectricityTab";
import AdminProvidersTab from "./services/AdminProvidersTab";
import AdminFlowpayPlansTab from "./services/AdminFlowpayPlansTab";

const AdminServicesTab = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Services Management</h2>
        <p className="text-muted-foreground">
          Manage pricing, plans, providers, and settings for all VTU services
        </p>
      </div>

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
          <TabsTrigger value="providers" className="gap-2">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Providers</span>
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-2">
            <Signal className="h-4 w-4" />
            <span className="hidden sm:inline">Data</span>
          </TabsTrigger>
          <TabsTrigger value="flowpay" className="gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Flowpay</span>
          </TabsTrigger>
          <TabsTrigger value="airtime" className="gap-2">
            <Smartphone className="h-4 w-4" />
            <span className="hidden sm:inline">Airtime</span>
          </TabsTrigger>
          <TabsTrigger value="cable" className="gap-2">
            <Tv className="h-4 w-4" />
            <span className="hidden sm:inline">Cable TV</span>
          </TabsTrigger>
          <TabsTrigger value="electricity" className="gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Electricity</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers">
          <AdminProvidersTab />
        </TabsContent>

        <TabsContent value="data">
          <AdminDataPlansTab />
        </TabsContent>

        <TabsContent value="flowpay">
          <AdminFlowpayPlansTab />
        </TabsContent>

        <TabsContent value="airtime">
          <AdminAirtimePricingTab />
        </TabsContent>

        <TabsContent value="cable">
          <AdminCableTVTab />
        </TabsContent>

        <TabsContent value="electricity">
          <AdminElectricityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminServicesTab;
