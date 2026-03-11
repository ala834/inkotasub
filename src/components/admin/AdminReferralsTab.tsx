import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Gift, TrendingUp, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ReferralStat {
  referrer_id: string;
  referrer_name: string;
  count: number;
  total_earned: number;
}

const AdminReferralsTab = () => {
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [totalPayouts, setTotalPayouts] = useState(0);
  const [topReferrers, setTopReferrers] = useState<ReferralStat[]>([]);
  const [allReferrals, setAllReferrals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all referrals
      const { data: referrals } = await supabase
        .from("referrals")
        .select("*")
        .order("created_at", { ascending: false });

      const refs = referrals || [];
      setAllReferrals(refs);
      setTotalReferrals(refs.length);
      setTotalPayouts(refs.reduce((sum, r) => sum + (r.reward_amount || 0), 0));

      // Aggregate top referrers
      const referrerMap = new Map<string, { count: number; total_earned: number }>();
      refs.forEach((r) => {
        const existing = referrerMap.get(r.referrer_id) || { count: 0, total_earned: 0 };
        referrerMap.set(r.referrer_id, {
          count: existing.count + 1,
          total_earned: existing.total_earned + (r.reward_amount || 0),
        });
      });

      // Fetch profile names for top referrers
      const referrerIds = Array.from(referrerMap.keys());
      if (referrerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", referrerIds);

        const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name || "Unknown"]));

        const stats: ReferralStat[] = Array.from(referrerMap.entries())
          .map(([id, data]) => ({
            referrer_id: id,
            referrer_name: profileMap.get(id) || "Unknown",
            ...data,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        setTopReferrers(stats);
      }
    } catch (error) {
      console.error("Error fetching referral data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(value);

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading referral data...</div>;
  }

  const fullyRewarded = allReferrals.filter((r) => r.status === "fully_rewarded").length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{totalReferrals}</p>
            <p className="text-sm text-muted-foreground">Total Referrals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Gift className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{formatCurrency(totalPayouts)}</p>
            <p className="text-sm text-muted-foreground">Total Payouts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{fullyRewarded}</p>
            <p className="text-sm text-muted-foreground">Fully Rewarded</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Trophy className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{topReferrers.length}</p>
            <p className="text-sm text-muted-foreground">Active Referrers</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Referrers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Top Referrers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topReferrers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No referrers yet</p>
          ) : (
            <div className="space-y-3">
              {topReferrers.map((ref, idx) => (
                <div key={ref.referrer_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-primary w-6">#{idx + 1}</span>
                    <div>
                      <p className="font-medium text-sm">{ref.referrer_name}</p>
                      <p className="text-xs text-muted-foreground">{ref.count} referral{ref.count > 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-primary">{formatCurrency(ref.total_earned)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Referrals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {allReferrals.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No referrals yet</p>
          ) : (
            <div className="space-y-2">
              {allReferrals.slice(0, 20).map((ref) => (
                <div key={ref.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm">
                  <div>
                    <p className="text-muted-foreground">{new Date(ref.created_at).toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground font-mono">{ref.referral_code}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{ref.reward_amount ? formatCurrency(ref.reward_amount) : "—"}</p>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      ref.status === "fully_rewarded" ? "bg-green-500/10 text-green-500" :
                      ref.status === "signup_rewarded" ? "bg-amber-500/10 text-amber-500" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {ref.status === "fully_rewarded" ? "Complete" : ref.status === "signup_rewarded" ? "Partial" : "Pending"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminReferralsTab;
