import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Smartphone, Search, Ban, CheckCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
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

const AdminDevicesTab = () => {
  const { user } = useAuth();
  const [devices, setDevices] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "blocked">("all");

  const fetchDevices = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("trusted_devices")
      .select("*")
      .order("last_used_at", { ascending: false });

    if (data) {
      setDevices(data);
      // Fetch profiles for user mapping
      const userIds = [...new Set(data.map((d) => d.user_id))];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, full_name, phone_number")
          .in("user_id", userIds);
        if (profilesData) {
          const map: Record<string, any> = {};
          profilesData.forEach((p) => (map[p.user_id] = p));
          setProfiles(map);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleBlock = async (device: any) => {
    const { error } = await supabase
      .from("trusted_devices")
      .update({
        is_blocked: true,
        is_active: false,
        blocked_at: new Date().toISOString(),
        blocked_by: user?.id,
        block_reason: "Blocked by admin",
      })
      .eq("id", device.id);

    if (!error) {
      // Send notification to user
      await supabase.from("notifications").insert({
        user_id: device.user_id,
        title: "Device Blocked",
        message: `Your device "${device.device_name}" has been blocked by an administrator. Contact support if you believe this is an error.`,
        type: "security",
      });

      // Log admin action
      await supabase.from("admin_activity_log").insert({
        admin_id: user?.id || "",
        action: "block_device",
        target_type: "device",
        target_id: device.id,
        target_user_id: device.user_id,
        details: { device_id: device.device_id, device_name: device.device_name },
      });

      toast.success("Device blocked");
      fetchDevices();
    }
  };

  const handleUnblock = async (device: any) => {
    const { error } = await supabase
      .from("trusted_devices")
      .update({
        is_blocked: false,
        blocked_at: null,
        blocked_by: null,
        block_reason: null,
      })
      .eq("id", device.id);

    if (!error) {
      await supabase.from("admin_activity_log").insert({
        admin_id: user?.id || "",
        action: "unblock_device",
        target_type: "device",
        target_id: device.id,
        target_user_id: device.user_id,
        details: { device_id: device.device_id, device_name: device.device_name },
      });
      toast.success("Device unblocked");
      fetchDevices();
    }
  };

  const filtered = devices.filter((d) => {
    const profile = profiles[d.user_id];
    const matchesSearch =
      !search ||
      d.device_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.device_id?.toLowerCase().includes(search.toLowerCase()) ||
      profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      profile?.phone_number?.includes(search);

    if (filter === "active") return matchesSearch && d.is_active && !d.is_blocked;
    if (filter === "blocked") return matchesSearch && d.is_blocked;
    return matchesSearch;
  });

  // Detect suspicious: multiple active devices for same user
  const suspiciousUserIds = new Set<string>();
  const userDeviceCounts: Record<string, number> = {};
  devices.forEach((d) => {
    if (d.is_active && !d.is_blocked) {
      userDeviceCounts[d.user_id] = (userDeviceCounts[d.user_id] || 0) + 1;
      if (userDeviceCounts[d.user_id] > 1) suspiciousUserIds.add(d.user_id);
    }
  });

  const stats = {
    total: devices.length,
    active: devices.filter((d) => d.is_active && !d.is_blocked).length,
    blocked: devices.filter((d) => d.is_blocked).length,
    suspicious: suspiciousUserIds.size,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Devices", value: stats.total, icon: Smartphone },
          { label: "Active", value: stats.active, icon: CheckCircle },
          { label: "Blocked", value: stats.blocked, icon: Ban },
          { label: "Suspicious", value: stats.suspicious, icon: AlertTriangle },
        ].map((s) => (
          <Card key={s.label} className="glass-card border-0">
            <CardContent className="p-4 text-center">
              <s.icon className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <Card className="glass-card border-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Device Management</CardTitle>
            <Button variant="outline" size="sm" onClick={fetchDevices}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, device, user..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex gap-2">
            {(["all", "active", "blocked"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No devices found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((device) => {
                      const profile = profiles[device.user_id];
                      const isSuspicious = suspiciousUserIds.has(device.user_id);
                      return (
                        <TableRow key={device.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{profile?.full_name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">{profile?.phone_number || ""}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{device.device_name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">{device.device_model} {device.os_version}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{device.platform || "web"}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {device.is_blocked ? (
                                <Badge variant="destructive" className="text-xs w-fit">Blocked</Badge>
                              ) : device.is_active ? (
                                <Badge className="text-xs w-fit">Active</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs w-fit">Inactive</Badge>
                              )}
                              {isSuspicious && (
                                <Badge variant="outline" className="text-xs w-fit border-yellow-500 text-yellow-600">
                                  <AlertTriangle className="h-3 w-3 mr-1" /> Suspicious
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {device.last_used_at ? format(new Date(device.last_used_at), "MMM d, h:mm a") : "N/A"}
                          </TableCell>
                          <TableCell>
                            {device.is_blocked ? (
                              <Button variant="outline" size="sm" onClick={() => handleUnblock(device)}>
                                Unblock
                              </Button>
                            ) : (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">Block</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Block Device</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently block device "{device.device_name}" and prevent it from accessing any account.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleBlock(device)}>Block Device</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDevicesTab;
