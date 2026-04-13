import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Camera, User, Phone, Mail, Save, ShieldCheck, ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import KYCBadge from "@/components/common/KYCBadge";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/layout/BottomNav";

const Profile = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    fullName: profile?.full_name || "",
    phoneNumber: profile?.phone_number || "",
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName);
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id);
      if (updateError) throw updateError;
      await refreshProfile();
      toast.success("Avatar updated!");
    } catch { toast.error("Failed to upload avatar"); }
    finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: formData.fullName, phone_number: formData.phoneNumber }).eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Profile updated!");
    } catch { toast.error("Failed to update profile"); }
    finally { setIsLoading(false); }
  };

  const getInitials = () => {
    if (profile?.full_name) return profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
    return user?.email?.charAt(0)?.toUpperCase() || "U";
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Green Header with Avatar */}
      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 px-4 pt-4 pb-20 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -left-6 top-20 w-28 h-28 rounded-full bg-white/5" />

        <div className="flex items-center justify-between mb-6 relative z-10">
          <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-lg font-bold text-white">My Profile</h1>
          <div className="w-10" />
        </div>

        {/* Centered Avatar */}
        <div className="flex flex-col items-center relative z-10">
          <div className="relative">
            <Avatar className="w-24 h-24 border-4 border-white/30 shadow-xl">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-white/20 text-white text-2xl font-bold">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg active:bg-gray-50 transition-colors"
            >
              {uploading ? <Loader2 className="h-4 w-4 text-green-600 animate-spin" /> : <Camera className="h-4 w-4 text-green-600" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>
          <p className="text-white font-bold text-lg mt-3">{profile?.full_name || "User"}</p>
          <p className="text-white/70 text-xs">{user?.email}</p>
          <div className="mt-2">
            <KYCBadge level={(profile as any)?.kyc_level} size="md" />
          </div>
        </div>
      </div>

      <main className="px-4 -mt-10 max-w-lg mx-auto space-y-4 relative z-10">
        {/* KYC Card */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate("/kyc")}
          className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 active:bg-gray-50 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm">KYC Verification</p>
            <p className="text-xs text-gray-500">Verify your identity for higher limits</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
        </motion.button>

        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4"
        >
          <p className="text-sm font-semibold text-gray-700">Personal Information</p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Enter your full name"
                className="w-full h-12 pl-11 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                value={user?.email || ""}
                disabled
                className="w-full h-12 pl-11 pr-4 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 text-sm cursor-not-allowed"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                placeholder="08012345678"
                className="w-full h-12 pl-11 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-sm"
              />
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={isLoading}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-green-500/25 active:from-green-700 active:to-green-600 transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Save className="h-5 w-5" /> Save Changes</>}
          </motion.button>
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Profile;
