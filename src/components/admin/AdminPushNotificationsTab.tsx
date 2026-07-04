import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, RefreshCw, Copy, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getStoredPushDiagnostics,
  type PushDiagnostics,
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
  const [diag, setDiag] = useState<PushDiagnostics>(() => getStoredPushDiagnostics());

  const refresh = () => setDiag(getStoredPushDiagnostics());

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
            <Bell className="h-5 w-5 text-primary" /> Push Notifications (FCM)
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
            <StatusBadge ok={!!diag.fcmToken} label={diag.fcmToken ? "FCM token present" : "No FCM token"} />
          </div>

          <div className="rounded-lg bg-muted/30 p-3">
            <Row label="Provider" value="Firebase Cloud Messaging" />
            <Row label="Platform" value={diag.platform} />
            <Row label="Bound user" value={diag.userId} mono />
            <Row
              label="FCM Token"
              value={
                diag.fcmToken ? (
                  <button onClick={() => copy(diag.fcmToken)} className="inline-flex items-center gap-1 underline">
                    {diag.fcmToken.substring(0, 40)}… <Copy className="h-3 w-3" />
                  </button>
                ) : "—"
              }
              mono
            />
            <Row label="Last error" value={diag.lastError ? <span className="text-destructive">{diag.lastError}</span> : "None"} />
            <Row label="Last updated" value={new Date(diag.lastUpdated).toLocaleString()} />
            <Row label="Device UA" value={<span className="font-mono text-[10px]">{ua}</span>} />
          </div>

          {!diag.isNative && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs text-yellow-700 dark:text-yellow-400">
              You are viewing this on the web. FCM only registers devices on the installed Android/iOS app.
              Open the diagnostics inside the installed app to capture an FCM token.
            </div>
          )}

          {diag.isNative && !diag.fcmToken && diag.isInitialized && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
              Initialized but no FCM token yet. Common causes:
              <ul className="list-disc ml-4 mt-1 space-y-1">
                <li><b>google-services.json</b> missing in <code>android/app/</code></li>
                <li>google-services Gradle plugin not applied in <code>android/app/build.gradle</code></li>
                <li>Notification permission denied (Android 13+ POST_NOTIFICATIONS)</li>
                <li>Test on a real device — emulators without Google Play don't receive FCM</li>
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-border/50 p-3 text-xs space-y-1">
            <p className="font-medium">How to test</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Open the installed app on an Android device and allow notifications.</li>
              <li>Reload this admin page — FCM token should appear above.</li>
              <li>Send a test from Firebase Console → Cloud Messaging using the token above.</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPushNotificationsTab;
