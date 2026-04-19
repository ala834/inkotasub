import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, RotateCcw, Ban, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface UnstablePlan {
  id: string;
  source: "service_plans" | "flowpay_manual_plans";
  network: string;
  plan_name: string;
  price: number;
  failure_count: number;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  permanently_disabled: boolean;
  is_enabled: boolean;
}

export default function AdminUnstablePlansTab() {
  const [plans, setPlans] = useState<UnstablePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: sp }, { data: fp }] = await Promise.all([
        supabase
          .from("service_plans")
          .select("id, network, plan_name, base_price, selling_price, failure_count, last_failure_at, last_failure_reason, permanently_disabled, is_enabled")
          .or("failure_count.gte.1,permanently_disabled.eq.true")
          .order("last_failure_at", { ascending: false, nullsFirst: false }),
        supabase
          .from("flowpay_manual_plans")
          .select("id, network, plan_name, price, failure_count, last_failure_at, last_failure_reason, permanently_disabled, is_enabled")
          .or("failure_count.gte.1,permanently_disabled.eq.true")
          .order("last_failure_at", { ascending: false, nullsFirst: false }),
      ]);

      const merged: UnstablePlan[] = [
        ...(sp || []).map((p: any) => ({
          id: p.id,
          source: "service_plans" as const,
          network: p.network,
          plan_name: p.plan_name,
          price: Number(p.selling_price ?? p.base_price ?? 0),
          failure_count: p.failure_count || 0,
          last_failure_at: p.last_failure_at,
          last_failure_reason: p.last_failure_reason,
          permanently_disabled: !!p.permanently_disabled,
          is_enabled: !!p.is_enabled,
        })),
        ...(fp || []).map((p: any) => ({
          id: p.id,
          source: "flowpay_manual_plans" as const,
          network: p.network,
          plan_name: p.plan_name,
          price: Number(p.price || 0),
          failure_count: p.failure_count || 0,
          last_failure_at: p.last_failure_at,
          last_failure_reason: p.last_failure_reason,
          permanently_disabled: !!p.permanently_disabled,
          is_enabled: !!p.is_enabled,
        })),
      ];

      merged.sort((a, b) => {
        const at = a.last_failure_at ? new Date(a.last_failure_at).getTime() : 0;
        const bt = b.last_failure_at ? new Date(b.last_failure_at).getTime() : 0;
        return bt - at;
      });

      setPlans(merged);
    } catch (e: any) {
      toast.error(e.message || "Failed to load unstable plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const restore = async (plan: UnstablePlan) => {
    setActionId(plan.id);
    try {
      const { error } = await supabase
        .from(plan.source)
        .update({
          failure_count: 0,
          last_failure_at: null,
          last_failure_reason: null,
          permanently_disabled: false,
          is_enabled: true,
        })
        .eq("id", plan.id);
      if (error) throw error;
      toast.success(`Restored "${plan.plan_name}"`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to restore plan");
    } finally {
      setActionId(null);
    }
  };

  const permanentlyDisable = async (plan: UnstablePlan) => {
    setActionId(plan.id);
    try {
      const { error } = await supabase
        .from(plan.source)
        .update({ permanently_disabled: true, is_enabled: false })
        .eq("id", plan.id);
      if (error) throw error;
      toast.success(`Permanently disabled "${plan.plan_name}"`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to disable plan");
    } finally {
      setActionId(null);
    }
  };

  const unstable = plans.filter((p) => !p.permanently_disabled && p.failure_count >= 2);
  const warning = plans.filter((p) => !p.permanently_disabled && p.failure_count === 1);
  const disabled = plans.filter((p) => p.permanently_disabled);

  const renderTable = (rows: UnstablePlan[], emptyText: string) => (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Plan</TableHead>
            <TableHead>Network</TableHead>
            <TableHead className="text-center">Failures</TableHead>
            <TableHead>Last Failure</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((p) => (
              <TableRow key={`${p.source}-${p.id}`}>
                <TableCell className="font-medium max-w-[220px] truncate">{p.plan_name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{p.network}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={p.failure_count >= 2 ? "destructive" : "secondary"}
                    className="font-mono"
                  >
                    {p.failure_count}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.last_failure_at
                    ? formatDistanceToNow(new Date(p.last_failure_at), { addSuffix: true })
                    : "—"}
                </TableCell>
                <TableCell className="max-w-[260px] truncate text-sm" title={p.last_failure_reason || ""}>
                  {p.last_failure_reason || "—"}
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline">
                    {p.source === "flowpay_manual_plans" ? "Flowpay" : "Catalog"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2 whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => restore(p)}
                    disabled={actionId === p.id}
                  >
                    {actionId === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Restore
                  </Button>
                  {!p.permanently_disabled && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive" disabled={actionId === p.id}>
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          Disable
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Permanently disable plan?</AlertDialogTitle>
                          <AlertDialogDescription>
                            "{p.plan_name}" ({p.network}) will be hidden from users until you
                            manually restore it. Existing transactions are unaffected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => permanentlyDisable(p)}>
                            Disable permanently
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Failed / Unstable Plans
          </CardTitle>
          <CardDescription>
            Plans automatically hidden from users after 2 provider failures. Restore once
            the issue is resolved, or disable permanently to keep them out of the catalog.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <Tabs defaultValue="unstable" className="space-y-4">
            <TabsList>
              <TabsTrigger value="unstable">
                Hidden from users
                <Badge variant="destructive" className="ml-2">{unstable.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="warning">
                Warning (1 fail)
                <Badge variant="secondary" className="ml-2">{warning.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="disabled">
                Permanently disabled
                <Badge variant="outline" className="ml-2">{disabled.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="unstable">
              {renderTable(unstable, "No unstable plans. Everything is healthy ✨")}
            </TabsContent>
            <TabsContent value="warning">
              {renderTable(warning, "No plans with warnings.")}
            </TabsContent>
            <TabsContent value="disabled">
              {renderTable(disabled, "No permanently disabled plans.")}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
