import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import {
  Bell,
  ShieldCheck,
  Wallet,
  Zap,
  Megaphone,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ONESIGNAL_APP_ID,
  getStoredOneSignalDiagnostics,
  type OneSignalDiagnostics,
} from "@/hooks/usePushNotifications";

const REASONS = [
  {
    icon: Wallet,
    title: "Transaction alerts",
    desc: "Instant confirmation when wallet funding, airtime, data, or bills go through.",
    color: "text-emerald-600 bg-emerald-500/10",
  },
  {
    icon: ShieldCheck,
    title: "Security updates",
    desc: "Login attempts on new devices, PIN changes, and suspicious activity warnings.",
    color: "text-emerald-600 bg-emerald-500/10",
  },
  {
    icon: Zap,
    title: "Service status",
    desc: "Know when a network or biller is down — and the moment it comes back online.",
    color: "text-emerald-600 bg-emerald-500/10",
  },
  {
    icon: Megaphone,
    title: "Promos & rewards",
    desc: "Referral bonuses, cashback, and limited-time data offers (you can opt out anytime).",
    color: "text-emerald-600 bg-emerald-500/10",
  },
];

const StatusBadge = ({ ok, label }: { ok: boolean | null; label: string }) => {
  if (ok === null)
    return (
      <Badge variant="secondary" className="gap-1">
        <AlertTriangle className="h-3 w-3" /> {label}
      </Badge>
    );
  return ok ? (
    <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
      <CheckCircle2 className="h-3 w-3" /> {label}
    </Badge>
  ) : (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" /> {label}
    </Badge>
  );
};

const NotificationPermission = () => {
  const navigate = useNavigate();
  const [diag, setDiag] = useState<OneSignalDiagnostics>(() => getStoredOneSignalDiagnostics());
  const [requesting, setRequesting] = useState(false);

  // Live-refresh diagnostics so the UI reflects the OneSignal hook's progress
  useEffect(() => {
    const t = setInterval(() => setDiag(getStoredOneSignalDiagnostics()), 1500);
    return () => clearInterval(t);
  }, []);

  const isNative = Capacitor.isNativePlatform();
  const webPermission = useMemo<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  }, [diag.lastUpdated]);

  const effectivePermission = isNative ? diag.permissionStatus : webPermission;
  const granted = effectivePermission === "granted";
  const denied = effectivePermission === "denied";
  const subscribed = !!diag.subscriptionId && diag.optedIn !== false;

  const handleEnable = async () => {
    setRequesting(true);
    try {
      if (isNative) {
        const mod: any = await import("onesignal-cordova-plugin");
        const OneSignal: any = mod.default ?? mod.OneSignal ?? mod;
        const accepted = await OneSignal.Notifications.requestPermission(true);
        try { OneSignal.User?.pushSubscription?.optIn?.(); } catch {}
        if (accepted) {
          toast.success("Notifications enabled");
        } else {
          toast.error("Permission denied. Enable it in your device Settings.");
        }
      } else {
        if (!("Notification" in window)) {
          toast.error("This browser does not support notifications");
          return;
        }
        const p = await Notification.requestPermission();
        if (p === "granted") toast.success("Notifications enabled");
        else toast.error("Permission denied. You can enable it in your browser settings.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not request permission");
    } finally {
      setRequesting(false);
      setTimeout(() => setDiag(getStoredOneSignalDiagnostics()), 500);
    }
  };

  const copy = (v: string | null) => {
    if (!v) return;
    navigator.clipboard.writeText(v).then(() => toast.success("Copied"));
  };

  return (
    <div className="min-h-screen gradient-hero pb-10">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-card border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-base font-display font-bold leading-tight">Notifications</h1>
            <p className="text-xs text-muted-foreground">Stay on top of your transactions</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 space-y-5">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="text-center"
        >
          <div className="mx-auto w-20 h-20 rounded-3xl gradient-primary flex items-center justify-center shadow-xl">
            <Bell className="h-10 w-10 text-primary-foreground" />
          </div>
          <h2 className="mt-4 text-2xl font-display font-bold">Turn on notifications</h2>
          <p className="mt-2 text-sm text-muted-foreground px-4">
            INKOTA SUB sends only what matters — transaction receipts, security alerts and service updates.
            No spam, ever.
          </p>
        </motion.div>

        {/* Reasons */}
        <div className="grid gap-3">
          {REASONS.map((r, i) => (
            <motion.div
              key={r.title}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i, type: "spring", stiffness: 240, damping: 22 }}
            >
              <Card className="glass-card border-0">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${r.color}`}>
                    <r.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Current status */}
        <Card className="glass-card border-0">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Current status</p>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setDiag(getStoredOneSignalDiagnostics())}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusBadge ok={isNative} label={isNative ? "Native app" : "Web preview"} />
              <StatusBadge ok={diag.isInitialized} label={diag.isInitialized ? "OneSignal ready" : "Initializing"} />
              <StatusBadge ok={granted ? true : denied ? false : null} label={`Permission: ${effectivePermission}`} />
              <StatusBadge ok={subscribed} label={subscribed ? "Subscribed" : "Not subscribed"} />
            </div>

            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">App ID</span>
                <span className="font-mono truncate">{ONESIGNAL_APP_ID}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">User binding</span>
                <span className="font-mono truncate">{diag.externalId ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2 items-center">
                <span className="text-muted-foreground">Player ID</span>
                {diag.subscriptionId ? (
                  <button
                    onClick={() => copy(diag.subscriptionId)}
                    className="font-mono truncate inline-flex items-center gap-1 underline max-w-[60%]"
                  >
                    <span className="truncate">{diag.subscriptionId}</span>
                    <Copy className="h-3 w-3 shrink-0" />
                  </button>
                ) : (
                  <span className="font-mono">—</span>
                )}
              </div>
              {diag.lastError && (
                <div className="text-destructive pt-1 border-t border-border/40">
                  <b>Last error:</b> {diag.lastError}
                </div>
              )}
            </div>

            {!isNative && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                You're on the web preview. Push notifications register only inside the installed Android app.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Primary action */}
        <div className="space-y-2">
          {granted && subscribed ? (
            <Button size="lg" className="w-full gradient-primary text-primary-foreground" disabled>
              <CheckCircle2 className="h-5 w-5 mr-2" /> You're all set
            </Button>
          ) : denied ? (
            <>
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                onClick={() =>
                  toast.info(
                    isNative
                      ? "Open Settings → Apps → INKOTA SUB → Notifications and enable them."
                      : "Click the lock icon in your browser address bar, then allow notifications."
                  )
                }
              >
                <ExternalLink className="h-4 w-4 mr-2" /> Open device settings
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Permission was previously denied. You must re-enable it from system settings.
              </p>
            </>
          ) : (
            <Button
              size="lg"
              className="w-full gradient-primary text-primary-foreground"
              onClick={handleEnable}
              disabled={requesting}
            >
              <Bell className="h-5 w-5 mr-2" />
              {requesting ? "Requesting…" : "Enable notifications"}
            </Button>
          )}

          <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate(-1)}>
            Maybe later
          </Button>
        </div>

        <p className="text-[11px] text-center text-muted-foreground px-6">
          You can change this anytime from <b>Settings → Push Notifications</b>. We never share your device token.
        </p>
      </main>
    </div>
  );
};

export default NotificationPermission;
