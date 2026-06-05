import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Percent, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Row {
  id: string;
  service_type: string;
  percentage: number;
  is_enabled: boolean;
  max_cashback: number | null;
}

const LABELS: Record<string, string> = {
  airtime: "Airtime",
  data: "Data",
  electricity: "Electricity",
  cable: "Cable TV",
  exam_pin: "Exam Card",
  recharge_card: "Recharge Card",
};

const AdminCashbackSettingsTab = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cashback_settings")
      .select("*")
      .order("service_type");
    setRows((data || []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const save = async (row: Row) => {
    setSavingKey(row.service_type);
    const { error } = await supabase
      .from("cashback_settings")
      .update({
        percentage: row.percentage,
        is_enabled: row.is_enabled,
        max_cashback: row.max_cashback,
      })
      .eq("id", row.id);
    setSavingKey(null);
    if (error) toast.error("Failed to update");
    else toast.success(`${LABELS[row.service_type] || row.service_type} updated`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-emerald-600" /> Cashback Rates
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-4">
            {rows.map((row, idx) => (
              <div key={row.id} className="p-4 border rounded-xl bg-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">{LABELS[row.service_type] || row.service_type}</div>
                  <Switch
                    checked={row.is_enabled}
                    onCheckedChange={(v) => {
                      const next = [...rows];
                      next[idx] = { ...row, is_enabled: v };
                      setRows(next);
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Cashback %</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={row.percentage}
                      onChange={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, percentage: Number(e.target.value) };
                        setRows(next);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Max Cashback (₦, optional)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={row.max_cashback ?? ""}
                      placeholder="No cap"
                      onChange={(e) => {
                        const next = [...rows];
                        next[idx] = {
                          ...row,
                          max_cashback: e.target.value === "" ? null : Number(e.target.value),
                        };
                        setRows(next);
                      }}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() => save(rows[idx])}
                  disabled={savingKey === row.service_type}
                >
                  {savingKey === row.service_type && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminCashbackSettingsTab;
