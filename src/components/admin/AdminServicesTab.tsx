import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Smartphone, Signal, Tv, Zap } from "lucide-react";
import AdminDataPlansTab from "./services/AdminDataPlansTab";
import AdminAirtimePricingTab from "./services/AdminAirtimePricingTab";
import AdminCableTVTab from "./services/AdminCableTVTab";
import AdminElectricityTab from "./services/AdminElectricityTab";

const AdminServicesTab = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Services Management</h2>
        <p className="text-muted-foreground">
          Manage pricing, plans, and settings for all VTU services
        </p>
      </div>

      <Tabs defaultValue="data" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="data" className="gap-2">
            <Signal className="h-4 w-4" />
            <span className="hidden sm:inline">Data</span>
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

        <TabsContent value="data">
          <AdminDataPlansTab />
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
