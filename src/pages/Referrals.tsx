import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Copy, Gift, Users, CheckCircle, TrendingUp, Share2, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Referral {
  id: string;
  referred_id: string;
  reward_amount: number | null;
  rewarded: boolean;
  created_at: string;
}

const Referrals = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchReferrals();
  }, []);

  const fetchReferrals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setReferrals(data || []);
      const earnings = (data || [])
        .filter((r: any) => r.reward_amount)
        .reduce((sum: number, r: any) => sum + (r.reward_amount || 0), 0);
      setTotalEarnings(earnings);
    } catch (error) {
      console.error("Error fetching referrals:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyReferralCode = () => {
    if (profile?.referral_code) {
      navigator.clipboard.writeText(profile.referral_code);
      toast.success("Referral code copied!");
    }
  };

  const shareReferralLink = () => {
    const referralLink = `${window.location.origin}/auth?ref=${profile?.referral_code}`;
    if (navigator.share) {
      navigator.share({
        title: "Join INKOTA SUB",
        text: `Use my referral code ${profile?.referral_code} to sign up on INKOTA SUB and we both earn rewards! Sign up here:`,
        url: referralLink,
      });
    } else {
      navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied!");
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const fullyRewarded = referrals.filter((r: any) => r.status === "fully_rewarded").length;

  return (
    <div className="min-h-screen gradient-hero pb-24">
      <Header />

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </button>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Referral Program
          </h1>
          <p className="text-muted-foreground">
            Invite friends and earn up to ₦150 per referral
          </p>
        </motion.div>

        {/* Referral Code Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 rounded-2xl mb-6 text-center"
        >
          <Gift className="h-12 w-12 text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground mb-2">Your Referral Code</p>
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-3xl font-bold font-mono tracking-widest text-primary">
              {profile?.referral_code || "--------"}
            </span>
            <Button variant="ghost" size="icon" onClick={copyReferralCode}>
              <Copy className="h-5 w-5" />
            </Button>
          </div>
          <Button onClick={shareReferralLink} className="w-full gap-2">
            <Share2 className="h-4 w-4" />
            Share Referral Link
          </Button>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-3 gap-3 mb-6"
        >
          <div className="glass-card p-4 rounded-xl text-center">
            <Users className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{referrals.length}</p>
            <p className="text-xs text-muted-foreground">Referrals</p>
          </div>
          <div className="glass-card p-4 rounded-xl text-center">
            <Wallet className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">
              {formatCurrency(totalEarnings)}
            </p>
            <p className="text-xs text-muted-foreground">Earnings</p>
          </div>
          <div className="glass-card p-4 rounded-xl text-center">
            <TrendingUp className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{fullyRewarded}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
        </motion.div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-4 rounded-2xl mb-6"
        >
          <h3 className="font-semibold text-foreground mb-3">How it works</h3>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <span className="bg-primary/20 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</span>
              <p>Share your referral code or link with friends</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-primary/20 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</span>
              <p>They sign up using your code — <strong className="text-primary">you earn ₦100</strong></p>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-primary/20 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">3</span>
              <p>When they complete their first transaction — <strong className="text-primary">you earn ₦50 more!</strong></p>
            </div>
          </div>
        </motion.div>

        {/* Referral History */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h3 className="font-semibold text-foreground mb-3">Your Referrals</h3>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : referrals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No referrals yet</p>
              <p className="text-sm">Share your code to start earning!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {referrals.map((referral) => (
                <div
                  key={referral.id}
                  className="glass-card p-4 rounded-xl flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(referral.created_at).toLocaleDateString()}
                    </p>
                    {referral.reward_amount && (
                      <p className="text-sm font-medium text-primary">
                        +{formatCurrency(referral.reward_amount)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {(referral as any).status === "fully_rewarded" ? (
                      <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Complete
                      </span>
                    ) : (referral as any).status === "signup_rewarded" ? (
                      <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded">
                        Awaiting 1st Txn
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Referrals;
