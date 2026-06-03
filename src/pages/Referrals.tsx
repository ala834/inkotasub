import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Copy, Gift, Users, CheckCircle, TrendingUp, Share2, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BottomNav from "@/components/layout/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Referral {
  id: string;
  referred_id: string;
  reward_amount: number | null;
  rewarded: boolean;
  created_at: string;
  status: string;
}

const Referrals = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { fetchReferrals(); }, []);

  const fetchReferrals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("referrals").select("*")
        .eq("referrer_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      setReferrals((data || []) as Referral[]);
      setTotalEarnings((data || []).filter((r: any) => r.reward_amount).reduce((sum: number, r: any) => sum + (r.reward_amount || 0), 0));
    } catch (error) { console.error("Error fetching referrals:", error); }
    finally { setIsLoading(false); }
  };

  const copyReferralCode = () => {
    if (profile?.referral_code) { navigator.clipboard.writeText(profile.referral_code); toast.success("Referral code copied!"); }
  };

  const shareReferralLink = () => {
    const referralLink = `${window.location.origin}/auth?ref=${profile?.referral_code}`;
    if (navigator.share) {
      navigator.share({ title: "Join Inkotasub", text: `Use my referral code ${profile?.referral_code} to sign up and we both earn rewards!`, url: referralLink });
    } else { navigator.clipboard.writeText(referralLink); toast.success("Referral link copied!"); }
  };

  const fmt = (v: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(v);
  const fullyRewarded = referrals.filter(r => r.status === "fully_rewarded").length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 px-4 pt-4 pb-10">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-lg font-bold text-white">Referral Program</h1>
        </div>

        {/* Referral Code */}
        <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-5 text-center">
          <p className="text-white/70 text-xs mb-1">Your Referral Code</p>
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-3xl font-bold font-mono tracking-[0.3em] text-white">
              {profile?.referral_code || "--------"}
            </span>
            <button onClick={copyReferralCode} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Copy className="h-4 w-4 text-white" />
            </button>
          </div>
          <button
            onClick={shareReferralLink}
            className="w-full h-11 rounded-xl bg-white text-green-700 font-semibold text-sm flex items-center justify-center gap-2 shadow-lg"
          >
            <Share2 className="h-4 w-4" /> Share Referral Link
          </button>
        </div>
      </div>

      <div className="px-4 -mt-5 space-y-3">
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-2"
        >
          {[
            { icon: Users, value: referrals.length, label: "Referrals", color: "from-emerald-500 to-teal-600" },
            { icon: Wallet, value: fmt(totalEarnings), label: "Earnings", color: "from-green-500 to-emerald-500" },
            { icon: TrendingUp, value: fullyRewarded, label: "Completed", color: "from-teal-500 to-emerald-600" },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-2xl p-3 shadow-sm text-center">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mx-auto mb-2`}>
                <stat.icon className="h-4 w-4 text-white" />
              </div>
              <p className="text-base font-bold text-gray-900">{stat.value}</p>
              <p className="text-[11px] text-gray-500">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 shadow-sm"
        >
          <h3 className="font-bold text-sm text-gray-900 mb-3">How it works</h3>
          <div className="space-y-3">
            {[
              { step: "1", text: "Share your referral code or link with friends" },
              { step: "2", text: <>They sign up using your code — <strong className="text-green-600">you earn ₦100</strong></> },
              { step: "3", text: <>When they make their first transaction — <strong className="text-green-600">you earn ₦50 more!</strong></> },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {item.step}
                </span>
                <p className="text-sm text-gray-600">{item.text}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Referral History */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h3 className="font-bold text-sm text-gray-900 mb-2">Your Referrals</h3>
          {isLoading ? (
            <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-gray-400 text-sm">Loading...</div>
          ) : referrals.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Users className="h-7 w-7 text-gray-300" />
              </div>
              <p className="text-gray-500 text-sm font-medium">No referrals yet</p>
              <p className="text-gray-400 text-xs">Share your code to start earning!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {referrals.map((referral, i) => (
                <motion.div
                  key={referral.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs text-gray-500">{new Date(referral.created_at).toLocaleDateString()}</p>
                    {referral.reward_amount && (
                      <p className="text-sm font-bold text-green-600">+{fmt(referral.reward_amount)}</p>
                    )}
                  </div>
                  {referral.status === "fully_rewarded" ? (
                    <span className="text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Complete
                    </span>
                  ) : referral.status === "signup_rewarded" ? (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                      Awaiting 1st Txn
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                      Pending
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Referrals;
