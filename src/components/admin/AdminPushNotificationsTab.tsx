import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, RefreshCw, Copy, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getStoredOneSignalDiagnostics,
  ONESIGNAL_APP_ID,
  type OneSignalDiagnostics,
} from "@/hooks/usePushNotifications";

const Row = ({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b border-border/40 last:border-0">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`text-xs text-right break-all ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
  </div>
);

const StatusBadge = ({ ok, label }: { ok: boolean | null; label: string }) => {
  if (ok === null) return <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3 w-3" />{label}</Badge>;
  return ok ? (
    <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />{label}</Badge>
  ) : (
    <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />{label}</Badge>
  );
};

const AdminPushNotificationsTab = () => {
  const [diag, setDiag] = useState<OneSignalDiagnostics>(() => getStoredOneSignalDiagnostics());

  const refresh = () => setDiag(getStoredOneSignalDiagnostics());

  useEffect(() => {
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  const copy = (v: string | null) => {
    if (!v) return;
    navigator.clipboard.writeText(v).then(() => toast.success("Copied"));
  };

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

  return (
    <div className="space-y-4">
      <Card className="glass-card border-0">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-primary" /> Push Notifications (OneSignal)
          </CardTitle>
          <Button size="sm" variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <StatusBadge ok={diag.isNative} label={diag.isNative ? "Native build" : "Web (push disabled)"} />
            <StatusBadge ok={diag.isInitialized} label={diag.isInitialized ? "Initialized" : "Not initialized"} />
            <StatusBadge
              ok={diag.permissionStatus === "granted" ? true : diag.permissionStatus === "denied" ? false : null}
              label={`Permission: ${diag.permissionStatus}`}
            />
            <StatusBadge ok={diag.optedIn} label={diag.optedIn ? "Subscribed" : "Not subscribed"} />
            <StatusBadge ok={!!diag.subscriptionId} label={diag.subscriptionId ? "Player ID present" : "No Player ID"} />
          </div>

          <div className="rounded-lg bg-muted/30 p-3">
            <Row label="OneSignal App ID" value={<span className="font-mono">{ONESIGNAL_APP_ID}</span>} />
            <Row label="Platform" value={diag.platform} />
            <Row label="External ID (user)" value={diag.externalId} mono />
            <Row
              label="Subscription / Player ID"
              value={
                diag.subscriptionId ? (
                  <button onClick={() => copy(diag.subscriptionId)} className="inline-flex items-center gap-1 underline">
                    {diag.subscriptionId} <Copy className="h-3 w-3" />
                  </button>
                ) : "—"
              }
              mono
            />
            <Row
              label="Push Token"
              value={diag.pushToken ? `${diag.pushToken.substring(0, 32)}…` : "—"}
              mono
            />
            <Row label="Last error" value={diag.lastError ? <span className="text-destructive">{diag.lastError}</span> : "None"} />
            <Row label="Last updated" value={new Date(diag.lastUpdated).toLocaleString()} />
            <Row label="Device UA" value={<span className="font-mono text-[10px]">{ua}</span>} />
          </div>

          {!diag.isNative && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs text-yellow-700 dark:text-yellow-400">
              You are viewing this on the web. OneSignal only registers devices on the installed Android/iOS app.
              Open the diagnostics inside the installed app to capture a Player ID.
            </div>
          )}

          {diag.isNative && !diag.subscriptionId && diag.isInitialized && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
              Initialized but no Player ID yet. Common causes:
              <ul className="list-disc ml-4 mt-1 space-y-1">
                <li><b>google-services.json</b> missing in <code>android/app/</code></li>
                <li>FCM Server Key not added in the OneSignal dashboard</li>
                <li>OneSignal Gradle plugin not applied in <code>android/app/build.gradle</code></li>
                <li>Notification permission denied (Android 13+)</li>
                <li>Test on a real device — emulators without Google Play don't receive FCM</li>
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-border/50 p-3 text-xs space-y-1">
            <p className="font-medium">How to test</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Open the installed app on an Android device, allow notifications.</li>
              <li>Reload this admin page in the app — Player ID should appear above.</li>
              <li>In OneSignal dashboard → Audience → Subscriptions, the device should appear as <b>Subscribed</b>.</li>
              <li>Send a test from OneSignal → Messages → New Push, target by External User ID with the value shown above.</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPushNotificationsTab;
