import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Shield, ShieldCheck, UserPlus, Trash2, Search, Loader2 } from "lucide-react";

interface AdminUser {
  user_id: string;
  role: "admin" | "moderator";
  created_at: string;
  email?: string;
  full_name?: string;
}

const AdminManagementTab = () => {
  const { user, isSuperAdmin } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "moderator">("moderator");
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at")
        .in("role", ["admin", "moderator"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch profiles for these users
      const userIds = (roles || []).map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      // Fetch emails via edge function
      let emailMap: Record<string, string> = {};
      try {
        const { data: emailData } = await supabase.functions.invoke("admin-get-user-emails", {
          body: { userIds },
        });
        if (emailData?.emails) {
          emailMap = emailData.emails;
        }
      } catch {}

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      const adminList: AdminUser[] = (roles || []).map(r => ({
        user_id: r.user_id,
        role: r.role as "admin" | "moderator",
        created_at: r.created_at,
        full_name: profileMap.get(r.user_id)?.full_name || "Unknown",
        email: emailMap[r.user_id] || "N/A",
      }));

      setAdmins(adminList);
    } catch (err) {
      console.error("Error fetching admins:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleAddAdmin = async () => {
    if (!addEmail.trim()) {
      toast({ title: "Enter an email address", variant: "destructive" });
      return;
    }

    setAdding(true);
    try {
      // Find user by email via edge function
      const { data: emailData } = await supabase.functions.invoke("admin-get-user-emails", {
        body: { searchEmail: addEmail.trim() },
      });

      const foundUserId = emailData?.userId;
      if (!foundUserId) {
        toast({ title: "User not found", description: "No account with that email.", variant: "destructive" });
        return;
      }

      // Check if already has admin/moderator role
      const existing = admins.find(a => a.user_id === foundUserId);
      if (existing) {
        toast({ title: "Already an admin", description: `This user is already a ${existing.role === 'admin' ? 'Super Admin' : 'Sub Admin'}.`, variant: "destructive" });
        return;
      }

      // Insert role
      const { error } = await supabase
        .from("user_roles")
        .upsert({ user_id: foundUserId, role: addRole }, { onConflict: "user_id,role" });

      if (error) throw error;

      // Log activity
      await supabase.from("admin_activity_log").insert({
        admin_id: user!.id,
        action: "add_admin",
        target_user_id: foundUserId,
        details: { role: addRole, email: addEmail.trim() },
      });

      toast({ title: "Admin added", description: `${addEmail} added as ${addRole === 'admin' ? 'Super Admin' : 'Sub Admin'}.` });
      setAddEmail("");
      fetchAdmins();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveAdmin = async (adminUser: AdminUser) => {
    if (adminUser.user_id === user?.id) {
      toast({ title: "Cannot remove yourself", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", adminUser.user_id)
        .eq("role", adminUser.role);

      if (error) throw error;

      // Log activity
      await supabase.from("admin_activity_log").insert({
        admin_id: user!.id,
        action: "remove_admin",
        target_user_id: adminUser.user_id,
        details: { role: adminUser.role, email: adminUser.email },
      });

      toast({ title: "Admin removed", description: `${adminUser.email} removed from ${adminUser.role === 'admin' ? 'Super Admin' : 'Sub Admin'}.` });
      fetchAdmins();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleChangeRole = async (adminUser: AdminUser, newRole: "admin" | "moderator") => {
    if (adminUser.user_id === user?.id) {
      toast({ title: "Cannot change your own role", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", adminUser.user_id)
        .eq("role", adminUser.role);

      if (error) throw error;

      await supabase.from("admin_activity_log").insert({
        admin_id: user!.id,
        action: "change_admin_role",
        target_user_id: adminUser.user_id,
        details: { old_role: adminUser.role, new_role: newRole, email: adminUser.email },
      });

      toast({ title: "Role updated" });
      fetchAdmins();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Access Denied</p>
          <p className="text-sm">Only Super Admins can manage admin roles.</p>
        </CardContent>
      </Card>
    );
  }

  const filtered = admins.filter(a =>
    !searchQuery ||
    a.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Add Admin */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add New Admin
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Enter user email..."
              value={addEmail}
              onChange={e => setAddEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={addRole} onValueChange={v => setAddRole(v as "admin" | "moderator")}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Super Admin</SelectItem>
                <SelectItem value="moderator">Sub Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAddAdmin} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Add Admin
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Admin List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Admin Team ({admins.length})</span>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search admins..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(admin => (
                  <TableRow key={`${admin.user_id}-${admin.role}`}>
                    <TableCell className="font-medium">{admin.full_name}</TableCell>
                    <TableCell>{admin.email}</TableCell>
                    <TableCell>
                      <Badge variant={admin.role === "admin" ? "default" : "secondary"} className="gap-1">
                        {admin.role === "admin" ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                        {admin.role === "admin" ? "Super Admin" : "Sub Admin"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(admin.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {admin.user_id !== user?.id && (
                        <div className="flex items-center justify-end gap-2">
                          <Select
                            value={admin.role}
                            onValueChange={v => handleChangeRole(admin, v as "admin" | "moderator")}
                          >
                            <SelectTrigger className="w-[130px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Super Admin</SelectItem>
                              <SelectItem value="moderator">Sub Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleRemoveAdmin(admin)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminManagementTab;
