import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Smartphone, Trash2, LogOut, Monitor, Shield, ArrowLeft } from "lucide-react";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDeviceManager } from "@/hooks/useDeviceManager";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const MyDevices = () => {
  const navigate = useNavigate();
  const { getMyDevices, removeDevice, logoutDevice } = useDeviceManager();
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDevices = async () => {
    setLoading(true);
    const data = await getMyDevices();
    setDevices(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleRemove = async (id: string) => {
    await removeDevice(id);
    toast.success("Device removed");
    fetchDevices();
  };

  const handleLogout = async (id: string) => {
    await logoutDevice(id);
    toast.success("Device logged out");
    fetchDevices();
  };

  const getDeviceIcon = (platform: string | null) => {
    if (platform === "web") return Monitor;
    return Smartphone;
  };

  return (
    <div className="min-h-screen gradient-hero pb-24">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-display font-bold text-foreground">My Devices</h1>
                <p className="text-xs text-muted-foreground">Manage linked devices</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
            </div>
          ) : devices.length === 0 ? (
            <Card className="glass-card border-0">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <Smartphone className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No devices linked to your account</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => {
                const DeviceIcon = getDeviceIcon(device.platform);
                return (
                  <Card key={device.id} className="glass-card border-0">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${device.is_active ? "bg-primary/10" : "bg-muted"}`}>
                          <DeviceIcon className={`h-5 w-5 ${device.is_active ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm text-foreground truncate">
                              {device.device_name || "Unknown Device"}
                            </p>
                            {device.is_active && (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">Active</Badge>
                            )}
                            {device.is_blocked && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">Blocked</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {device.device_model || device.platform || "Unknown"} • {device.os_version || ""}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Last active: {device.last_used_at ? format(new Date(device.last_used_at), "MMM d, yyyy h:mm a") : "N/A"}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {device.is_active && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleLogout(device.id)}>
                              <LogOut className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Device</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will unlink "{device.device_name}" from your account. You'll need to log in again on that device.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleRemove(device.id)}>Remove</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </motion.div>
      </main>
      <BottomNav />
    </div>
  );
};

export default MyDevices;
