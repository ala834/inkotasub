import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Phone,
  Mail,
  User,
  Calendar,
  CreditCard,
  Camera,
  MapPin,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useKYC } from "@/hooks/useKYC";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const KYCVerification = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { verifications, currentLevel, getVerification, getDailyLimit, submitLevel1, submitLevel2, submitLevel3, refresh } = useKYC();
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Level 2 form
  const [l2Form, setL2Form] = useState({ fullName: profile?.full_name || "", dateOfBirth: "", ninNumber: "" });
  // Level 3 form
  const [l3Form, setL3Form] = useState({ bvnNumber: "", selfieUrl: "", address: "", city: "", state: "" });
  const [uploading, setUploading] = useState(false);

  const handleLevel1 = async () => {
    setIsSubmitting(true);
    const result = await submitLevel1();
    if (result?.error) toast.error("Failed to verify Level 1");
    else toast.success("Level 1 verified!");
    setIsSubmitting(false);
  };

  const handleLevel2 = async () => {
    if (!l2Form.fullName || !l2Form.dateOfBirth || !l2Form.ninNumber) {
      toast.error("Please fill all fields");
      return;
    }
    if (l2Form.ninNumber.length !== 11) {
      toast.error("NIN must be 11 digits");
      return;
    }
    setIsSubmitting(true);
    const result = await submitLevel2(l2Form);
    if (result?.error) toast.error("Failed to submit");
    else {
      toast.success("Level 2 KYC submitted for review!");
      setActiveLevel(null);
    }
    setIsSubmitting(false);
  };

  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const fileName = `${user.id}/kyc-selfie.${file.name.split(".").pop()}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName);
      setL3Form((prev) => ({ ...prev, selfieUrl: publicUrl }));
      toast.success("Selfie uploaded!");
    } catch {
      toast.error("Failed to upload selfie");
    } finally {
      setUploading(false);
    }
  };

  const handleLevel3 = async () => {
    if (!l3Form.bvnNumber || !l3Form.selfieUrl || !l3Form.address || !l3Form.city || !l3Form.state) {
      toast.error("Please fill all fields and upload selfie");
      return;
    }
    if (l3Form.bvnNumber.length !== 11) {
      toast.error("BVN must be 11 digits");
      return;
    }
    setIsSubmitting(true);
    const result = await submitLevel3(l3Form);
    if (result?.error) toast.error("Failed to submit");
    else {
      toast.success("Level 3 KYC submitted for review!");
      setActiveLevel(null);
    }
    setIsSubmitting(false);
  };

  const getStatusIcon = (status?: string) => {
    if (status === "approved") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    if (status === "pending") return <Clock className="h-5 w-5 text-yellow-500" />;
    if (status === "rejected") return <XCircle className="h-5 w-5 text-destructive" />;
    return <ChevronRight className="h-5 w-5 text-muted-foreground" />;
  };

  const getStatusBadge = (status?: string) => {
    if (status === "approved") return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Verified</Badge>;
    if (status === "pending") return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pending</Badge>;
    if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="outline">Not Started</Badge>;
  };

  const levels = [
    {
      key: "level_1",
      title: "Level 1 - Basic",
      desc: "Phone & Email verification",
      limit: "₦50,000/day",
      icon: Shield,
      color: "text-blue-500",
    },
    {
      key: "level_2",
      title: "Level 2 - Intermediate",
      desc: "NIN verification",
      limit: "₦200,000/day",
      icon: ShieldCheck,
      color: "text-primary",
    },
    {
      key: "level_3",
      title: "Level 3 - Advanced",
      desc: "BVN & Selfie verification",
      limit: "₦1,000,000/day",
      icon: ShieldAlert,
      color: "text-green-500",
    },
  ];

  return (
    <div className="min-h-screen gradient-hero pb-24">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground">KYC Verification</h1>
              <p className="text-sm text-muted-foreground">
                Current limit: <span className="font-semibold text-primary">₦{getDailyLimit().toLocaleString()}/day</span>
              </p>
            </div>
          </div>

          {/* Current Level Badge */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Current Level</p>
                <p className="text-lg font-bold text-primary capitalize">{currentLevel.replace("_", " ")}</p>
              </div>
            </CardContent>
          </Card>

          {/* Level Cards */}
          {levels.map((level) => {
            const v = getVerification(level.key);
            const isActive = activeLevel === level.key;
            const canStart =
              level.key === "level_1" ||
              (level.key === "level_2" && getVerification("level_1")?.status === "approved") ||
              (level.key === "level_3" && getVerification("level_2")?.status === "approved");

            return (
              <Card key={level.key} className={`transition-all ${isActive ? "ring-2 ring-primary" : ""}`}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => {
                    if (v?.status === "approved") return;
                    if (!canStart) {
                      toast.error("Complete the previous level first");
                      return;
                    }
                    setActiveLevel(isActive ? null : level.key);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <level.icon className={`h-6 w-6 ${level.color}`} />
                      <div>
                        <CardTitle className="text-base">{level.title}</CardTitle>
                        <CardDescription>{level.desc} • Limit: {level.limit}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(v?.status)}
                      {getStatusIcon(v?.status)}
                    </div>
                  </div>
                  {v?.status === "rejected" && v.rejection_reason && (
                    <p className="text-sm text-destructive mt-2">Reason: {v.rejection_reason}</p>
                  )}
                </CardHeader>

                {isActive && v?.status !== "approved" && (
                  <CardContent className="space-y-4 border-t pt-4">
                    {/* Level 1 Form */}
                    {level.key === "level_1" && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted">
                          <Phone className="h-5 w-5 text-green-500" />
                          <div>
                            <p className="text-sm font-medium">Phone Number</p>
                            <p className="text-xs text-muted-foreground">{profile?.phone_number || "Not set"}</p>
                          </div>
                          {profile?.phone_number && <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />}
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted">
                          <Mail className="h-5 w-5 text-blue-500" />
                          <div>
                            <p className="text-sm font-medium">Email Address</p>
                            <p className="text-xs text-muted-foreground">{user?.email || "Not set"}</p>
                          </div>
                          {user?.email && <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />}
                        </div>
                        <Button onClick={handleLevel1} disabled={isSubmitting || !profile?.phone_number || !user?.email} className="w-full gradient-primary text-primary-foreground">
                          {isSubmitting ? "Verifying..." : "Complete Level 1"}
                        </Button>
                      </div>
                    )}

                    {/* Level 2 Form */}
                    {level.key === "level_2" && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Full Name (as on NIN)</Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input value={l2Form.fullName} onChange={(e) => setL2Form({ ...l2Form, fullName: e.target.value })} className="pl-10 h-12 rounded-xl" placeholder="Full legal name" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Date of Birth</Label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input type="date" value={l2Form.dateOfBirth} onChange={(e) => setL2Form({ ...l2Form, dateOfBirth: e.target.value })} className="pl-10 h-12 rounded-xl" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>NIN (National Identification Number)</Label>
                          <div className="relative">
                            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input value={l2Form.ninNumber} onChange={(e) => setL2Form({ ...l2Form, ninNumber: e.target.value.replace(/\D/g, "").slice(0, 11) })} className="pl-10 h-12 rounded-xl" placeholder="11-digit NIN" maxLength={11} />
                          </div>
                        </div>
                        <Button onClick={handleLevel2} disabled={isSubmitting} className="w-full gradient-primary text-primary-foreground">
                          {isSubmitting ? "Submitting..." : "Submit for Review"}
                        </Button>
                      </div>
                    )}

                    {/* Level 3 Form */}
                    {level.key === "level_3" && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>BVN (Bank Verification Number)</Label>
                          <div className="relative">
                            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input value={l3Form.bvnNumber} onChange={(e) => setL3Form({ ...l3Form, bvnNumber: e.target.value.replace(/\D/g, "").slice(0, 11) })} className="pl-10 h-12 rounded-xl" placeholder="11-digit BVN" maxLength={11} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Selfie / Face Photo</Label>
                          <div className="flex items-center gap-3">
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex-1">
                              <Camera className="h-4 w-4 mr-2" />
                              {uploading ? "Uploading..." : l3Form.selfieUrl ? "Change Selfie" : "Upload Selfie"}
                            </Button>
                            {l3Form.selfieUrl && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                          </div>
                          <input ref={fileInputRef} type="file" accept="image/*" capture="user" onChange={handleSelfieUpload} className="hidden" />
                        </div>
                        <div className="space-y-2">
                          <Label>Residential Address</Label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input value={l3Form.address} onChange={(e) => setL3Form({ ...l3Form, address: e.target.value })} className="pl-10 h-12 rounded-xl" placeholder="Street address" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>City</Label>
                            <Input value={l3Form.city} onChange={(e) => setL3Form({ ...l3Form, city: e.target.value })} className="h-12 rounded-xl" placeholder="City" />
                          </div>
                          <div className="space-y-2">
                            <Label>State</Label>
                            <Input value={l3Form.state} onChange={(e) => setL3Form({ ...l3Form, state: e.target.value })} className="h-12 rounded-xl" placeholder="State" />
                          </div>
                        </div>
                        <Button onClick={handleLevel3} disabled={isSubmitting} className="w-full gradient-primary text-primary-foreground">
                          {isSubmitting ? "Submitting..." : "Submit for Review"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </motion.div>
      </main>
      <BottomNav />
    </div>
  );
};

export default KYCVerification;
