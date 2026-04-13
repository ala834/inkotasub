import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldAlert, Phone, Mail, User, Calendar,
  CreditCard, Camera, MapPin, CheckCircle2, Clock, XCircle, ArrowLeft, ChevronRight, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useKYC } from "@/hooks/useKYC";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/layout/BottomNav";

const KYCVerification = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { verifications, currentLevel, getVerification, getDailyLimit, submitLevel1, submitLevel2, submitLevel3 } = useKYC();
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [l2Form, setL2Form] = useState({ fullName: profile?.full_name || "", dateOfBirth: "", ninNumber: "" });
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
    if (!l2Form.fullName || !l2Form.dateOfBirth || !l2Form.ninNumber) { toast.error("Please fill all fields"); return; }
    if (l2Form.ninNumber.length !== 11) { toast.error("NIN must be 11 digits"); return; }
    setIsSubmitting(true);
    const result = await submitLevel2(l2Form);
    if (result?.error) toast.error("Failed to submit");
    else { toast.success("Level 2 KYC submitted for review!"); setActiveLevel(null); }
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
    } catch { toast.error("Failed to upload selfie"); }
    finally { setUploading(false); }
  };

  const handleLevel3 = async () => {
    if (!l3Form.bvnNumber || !l3Form.selfieUrl || !l3Form.address || !l3Form.city || !l3Form.state) { toast.error("Please fill all fields and upload selfie"); return; }
    if (l3Form.bvnNumber.length !== 11) { toast.error("BVN must be 11 digits"); return; }
    setIsSubmitting(true);
    const result = await submitLevel3(l3Form);
    if (result?.error) toast.error("Failed to submit");
    else { toast.success("Level 3 KYC submitted for review!"); setActiveLevel(null); }
    setIsSubmitting(false);
  };

  const levels = [
    { key: "level_1", title: "Basic Verification", desc: "Phone & Email", limit: "₦50,000/day", icon: Shield, gradient: "from-blue-500 to-blue-600" },
    { key: "level_2", title: "Intermediate", desc: "NIN Verification", limit: "₦200,000/day", icon: ShieldCheck, gradient: "from-green-500 to-emerald-500" },
    { key: "level_3", title: "Advanced", desc: "BVN & Selfie", limit: "₦1,000,000/day", icon: ShieldAlert, gradient: "from-amber-500 to-orange-500" },
  ];

  const getProgressPercent = () => {
    if (currentLevel === "level_3") return 100;
    if (currentLevel === "level_2") return 66;
    if (currentLevel === "level_1") return 33;
    return 0;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 px-4 pt-4 pb-10">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-lg font-bold text-white">Identity Verification</h1>
        </div>

        {/* Progress */}
        <div className="bg-white/15 rounded-2xl p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/80 text-xs font-medium">Verification Progress</span>
            <span className="text-white text-xs font-bold">{getProgressPercent()}%</span>
          </div>
          <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-white rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${getProgressPercent()}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <p className="text-white/70 text-xs mt-2">
            Daily limit: <span className="text-white font-bold">₦{getDailyLimit().toLocaleString()}</span>
          </p>
        </div>
      </div>

      <div className="px-4 -mt-5 space-y-3">
        {levels.map((level, i) => {
          const v = getVerification(level.key);
          const isActive = activeLevel === level.key;
          const isApproved = v?.status === "approved";
          const isPending = v?.status === "pending";
          const isRejected = v?.status === "rejected";
          const canStart =
            level.key === "level_1" ||
            (level.key === "level_2" && getVerification("level_1")?.status === "approved") ||
            (level.key === "level_3" && getVerification("level_2")?.status === "approved");

          return (
            <motion.div
              key={level.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`bg-white rounded-2xl shadow-sm overflow-hidden ${isActive ? "ring-2 ring-green-500" : ""}`}
            >
              {/* Card Header */}
              <button
                className="w-full p-4 flex items-center gap-3 text-left"
                onClick={() => {
                  if (isApproved) return;
                  if (!canStart) { toast.error("Complete the previous level first"); return; }
                  setActiveLevel(isActive ? null : level.key);
                }}
              >
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${level.gradient} flex items-center justify-center shrink-0`}>
                  <level.icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-900">{level.title}</p>
                  <p className="text-xs text-gray-500">{level.desc} • {level.limit}</p>
                </div>
                {isApproved ? (
                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                  </span>
                ) : isPending ? (
                  <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Pending
                  </span>
                ) : isRejected ? (
                  <span className="text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" /> Rejected
                  </span>
                ) : !canStart ? (
                  <Lock className="h-4 w-4 text-gray-300" />
                ) : (
                  <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${isActive ? "rotate-90" : ""}`} />
                )}
              </button>

              {isRejected && v?.rejection_reason && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">Reason: {v.rejection_reason}</p>
                </div>
              )}

              {/* Expanded Form */}
              {isActive && !isApproved && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  className="border-t border-gray-100 p-4 space-y-3"
                >
                  {level.key === "level_1" && (
                    <>
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                        <Phone className="h-5 w-5 text-green-500" />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-gray-900">Phone Number</p>
                          <p className="text-xs text-gray-500">{profile?.phone_number || "Not set"}</p>
                        </div>
                        {profile?.phone_number && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                        <Mail className="h-5 w-5 text-blue-500" />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-gray-900">Email Address</p>
                          <p className="text-xs text-gray-500">{user?.email || "Not set"}</p>
                        </div>
                        {user?.email && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      </div>
                      <button
                        onClick={handleLevel1}
                        disabled={isSubmitting || !profile?.phone_number || !user?.email}
                        className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold text-sm shadow-lg shadow-green-500/25 disabled:opacity-50"
                      >
                        {isSubmitting ? "Verifying..." : "Complete Level 1"}
                      </button>
                    </>
                  )}

                  {level.key === "level_2" && (
                    <>
                      <InputField icon={User} label="Full Name (as on NIN)" value={l2Form.fullName} onChange={v => setL2Form(p => ({ ...p, fullName: v }))} placeholder="Full legal name" />
                      <InputField icon={Calendar} label="Date of Birth" type="date" value={l2Form.dateOfBirth} onChange={v => setL2Form(p => ({ ...p, dateOfBirth: v }))} />
                      <InputField icon={CreditCard} label="NIN (11 digits)" value={l2Form.ninNumber} onChange={v => setL2Form(p => ({ ...p, ninNumber: v.replace(/\D/g, "").slice(0, 11) }))} placeholder="11-digit NIN" maxLength={11} />
                      <button onClick={handleLevel2} disabled={isSubmitting} className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold text-sm shadow-lg shadow-green-500/25 disabled:opacity-50">
                        {isSubmitting ? "Submitting..." : "Submit for Review"}
                      </button>
                    </>
                  )}

                  {level.key === "level_3" && (
                    <>
                      <InputField icon={CreditCard} label="BVN (11 digits)" value={l3Form.bvnNumber} onChange={v => setL3Form(p => ({ ...p, bvnNumber: v.replace(/\D/g, "").slice(0, 11) }))} placeholder="11-digit BVN" maxLength={11} />
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1.5 block">Selfie / Face Photo</label>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="w-full h-12 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center gap-2 text-sm text-gray-600"
                        >
                          <Camera className="h-4 w-4" />
                          {uploading ? "Uploading..." : l3Form.selfieUrl ? "✓ Selfie uploaded — Change" : "Upload Selfie"}
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" capture="user" onChange={handleSelfieUpload} className="hidden" />
                      </div>
                      <InputField icon={MapPin} label="Address" value={l3Form.address} onChange={v => setL3Form(p => ({ ...p, address: v }))} placeholder="Street address" />
                      <div className="grid grid-cols-2 gap-3">
                        <InputField label="City" value={l3Form.city} onChange={v => setL3Form(p => ({ ...p, city: v }))} placeholder="City" />
                        <InputField label="State" value={l3Form.state} onChange={v => setL3Form(p => ({ ...p, state: v }))} placeholder="State" />
                      </div>
                      <button onClick={handleLevel3} disabled={isSubmitting} className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold text-sm shadow-lg shadow-green-500/25 disabled:opacity-50">
                        {isSubmitting ? "Submitting..." : "Submit for Review"}
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      <BottomNav />
    </div>
  );
};

const InputField = ({ icon: Icon, label, value, onChange, placeholder, type = "text", maxLength }: {
  icon?: any; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; maxLength?: number;
}) => (
  <div>
    <label className="text-xs font-medium text-gray-700 mb-1.5 block">{label}</label>
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`w-full h-12 ${Icon ? "pl-10" : "pl-4"} pr-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent`}
      />
    </div>
  </div>
);

export default KYCVerification;
