import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, Search, Eye, ShieldCheck, ShieldAlert, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface KYCRecord {
  id: string;
  user_id: string;
  level: string;
  status: string;
  phone_verified: boolean;
  email_verified: boolean;
  full_name: string | null;
  date_of_birth: string | null;
  nin_number: string | null;
  bvn_number: string | null;
  selfie_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

const AdminKYCTab = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<KYCRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("pending");
  const [selectedRecord, setSelectedRecord] = useState<KYCRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const fetchRecords = async () => {
    setIsLoading(true);
    let query = supabase.from("kyc_verifications").select("*").order("created_at", { ascending: false });
    if (filter !== "all") query = query.eq("status", filter as any);
    const { data } = await query;
    setRecords((data as unknown as KYCRecord[]) || []);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, [filter]);

  const handleApprove = async (record: KYCRecord) => {
    setProcessing(true);
    const limits: Record<string, number> = { level_1: 50000, level_2: 200000, level_3: 1000000 };

    const { error } = await supabase
      .from("kyc_verifications")
      .update({
        status: "approved" as any,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", record.id);

    if (!error) {
      await supabase
        .from("profiles")
        .update({
          kyc_level: record.level as any,
          daily_transaction_limit: limits[record.level] || 50000,
        } as any)
        .eq("user_id", record.user_id);

      // Send notification
      await supabase.from("notifications").insert({
        user_id: record.user_id,
        title: "KYC Approved ✅",
        message: `Your ${record.level.replace("_", " ")} verification has been approved. Your daily limit is now ₦${(limits[record.level] || 50000).toLocaleString()}.`,
        type: "success",
      } as any);

      // Log activity
      await supabase.from("admin_activity_log").insert({
        admin_id: user?.id || "",
        action: "kyc_approved",
        target_user_id: record.user_id,
        target_type: "kyc",
        target_id: record.id,
        details: { level: record.level },
      });

      toast.success("KYC approved successfully");
      setSelectedRecord(null);
      fetchRecords();
    } else {
      toast.error("Failed to approve");
    }
    setProcessing(false);
  };

  const handleReject = async (record: KYCRecord) => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    setProcessing(true);
    const { error } = await supabase
      .from("kyc_verifications")
      .update({
        status: "rejected" as any,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      } as any)
      .eq("id", record.id);

    if (!error) {
      await supabase.from("notifications").insert({
        user_id: record.user_id,
        title: "KYC Rejected ❌",
        message: `Your ${record.level.replace("_", " ")} verification was rejected. Reason: ${rejectionReason}`,
        type: "error",
      } as any);

      await supabase.from("admin_activity_log").insert({
        admin_id: user?.id || "",
        action: "kyc_rejected",
        target_user_id: record.user_id,
        target_type: "kyc",
        target_id: record.id,
        details: { level: record.level, reason: rejectionReason },
      });

      toast.success("KYC rejected");
      setSelectedRecord(null);
      setRejectionReason("");
      fetchRecords();
    } else {
      toast.error("Failed to reject");
    }
    setProcessing(false);
  };

  const getLevelIcon = (level: string) => {
    if (level === "level_3") return <ShieldAlert className="h-4 w-4 text-green-500" />;
    if (level === "level_2") return <ShieldCheck className="h-4 w-4 text-primary" />;
    return <Shield className="h-4 w-4 text-blue-500" />;
  };

  const getStatusBadge = (status: string) => {
    if (status === "approved") return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Approved</Badge>;
    if (status === "pending") return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pending</Badge>;
    return <Badge variant="destructive">Rejected</Badge>;
  };

  const filteredRecords = records.filter(
    (r) => !search || r.full_name?.toLowerCase().includes(search.toLowerCase()) || r.user_id.includes(search) || r.nin_number?.includes(search)
  );

  const counts = {
    pending: records.filter((r) => r.status === "pending").length,
    approved: records.filter((r) => r.status === "approved").length,
    rejected: records.filter((r) => r.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 text-yellow-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{counts.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{counts.approved}</p>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle className="h-6 w-6 text-destructive mx-auto mb-1" />
            <p className="text-2xl font-bold">{counts.rejected}</p>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" placeholder="Search by name, ID, or NIN..." />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border px-3 py-2 text-sm bg-background">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* Records List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
        </div>
      ) : filteredRecords.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">No KYC submissions found.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((record) => (
            <Card key={record.id} className="cursor-pointer hover:ring-1 hover:ring-primary/20 transition-all" onClick={() => setSelectedRecord(record)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getLevelIcon(record.level)}
                    <div>
                      <p className="font-medium text-sm">{record.full_name || "User"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{record.level.replace("_", " ")} • {new Date(record.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(record.status)}
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedRecord} onOpenChange={() => { setSelectedRecord(null); setRejectionReason(""); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRecord && getLevelIcon(selectedRecord.level)}
              KYC Details - {selectedRecord?.level.replace("_", " ")}
            </DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                {getStatusBadge(selectedRecord.status)}
              </div>

              {selectedRecord.full_name && (
                <div>
                  <Label className="text-xs text-muted-foreground">Full Name</Label>
                  <p className="font-medium">{selectedRecord.full_name}</p>
                </div>
              )}
              {selectedRecord.date_of_birth && (
                <div>
                  <Label className="text-xs text-muted-foreground">Date of Birth</Label>
                  <p className="font-medium">{new Date(selectedRecord.date_of_birth).toLocaleDateString()}</p>
                </div>
              )}
              {selectedRecord.nin_number && (
                <div>
                  <Label className="text-xs text-muted-foreground">NIN</Label>
                  <p className="font-medium font-mono">{selectedRecord.nin_number}</p>
                </div>
              )}
              {selectedRecord.bvn_number && (
                <div>
                  <Label className="text-xs text-muted-foreground">BVN</Label>
                  <p className="font-medium font-mono">{selectedRecord.bvn_number}</p>
                </div>
              )}
              {selectedRecord.selfie_url && (
                <div>
                  <Label className="text-xs text-muted-foreground">Selfie</Label>
                  <img src={selectedRecord.selfie_url} alt="Selfie" className="w-32 h-32 object-cover rounded-xl mt-1" />
                </div>
              )}
              {selectedRecord.address && (
                <div>
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <p className="font-medium">{selectedRecord.address}, {selectedRecord.city}, {selectedRecord.state}</p>
                </div>
              )}
              {selectedRecord.rejection_reason && (
                <div>
                  <Label className="text-xs text-muted-foreground">Rejection Reason</Label>
                  <p className="text-sm text-destructive">{selectedRecord.rejection_reason}</p>
                </div>
              )}

              {selectedRecord.status === "pending" && (
                <>
                  <div className="space-y-2">
                    <Label>Rejection Reason (if rejecting)</Label>
                    <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Reason for rejection..." />
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="destructive" onClick={() => handleReject(selectedRecord)} disabled={processing}>
                      {processing ? "..." : "Reject"}
                    </Button>
                    <Button onClick={() => handleApprove(selectedRecord)} disabled={processing} className="gradient-primary text-primary-foreground">
                      {processing ? "..." : "Approve"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminKYCTab;
