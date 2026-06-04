import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CashbackEntry {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
  reference: string;
}

const Cashback = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [entries, setEntries] = useState<CashbackEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("cashback_transactions")
        .select("id, amount, reason, created_at, reference")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setEntries((data || []) as CashbackEntry[]);
      setLoading(false);
    })();
  }, [user]);

  const total = entries.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background pb-10">
      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 px-4 pt-4 pb-12 text-white">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/10 rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Cashback</h1>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm opacity-90">Total Cashback Received</span>
        </div>
        <div className="text-3xl font-bold">₦{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
      </div>

      <div className="px-4 -mt-6">
        <Card>
          <CardContent className="p-4">
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <Gift className="h-10 w-10 mx-auto mb-2 opacity-50" />
                No cashback yet
              </div>
            ) : (
              <ul className="divide-y">
                {entries.map((e) => (
                  <li key={e.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{e.reason}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="font-semibold text-emerald-600 whitespace-nowrap">
                      +₦{Number(e.amount).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Cashback;
