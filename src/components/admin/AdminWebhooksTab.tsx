import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Webhook, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface WebhookLog {
  id: string;
  provider: string;
  event_type: string | null;
  payload: unknown;
  processed: boolean | null;
  created_at: string;
}

const AdminWebhooksTab = () => {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [eventFilter]);

  const fetchLogs = async () => {
    setIsLoading(true);
    let query = supabase
      .from("webhooks_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (eventFilter !== "all") {
      query = query.eq("event_type", eventFilter);
    }

    const { data, error } = await query;

    if (!error && data) {
      setLogs(data as WebhookLog[]);
    }
    setIsLoading(false);
  };

  const getEventIcon = (eventType: string | null, processed: boolean | null) => {
    if (processed === null) return <Clock className="h-4 w-4 text-warning" />;
    if (processed) return <CheckCircle className="h-4 w-4 text-success" />;
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  const getEventColor = (eventType: string | null) => {
    if (eventType?.includes("success")) return "text-success";
    if (eventType?.includes("failed") || eventType?.includes("reversed")) return "text-destructive";
    return "text-muted-foreground";
  };

  const filteredLogs = logs.filter((log) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      log.event_type?.toLowerCase().includes(searchLower) ||
      log.provider?.toLowerCase().includes(searchLower) ||
      JSON.stringify(log.payload)?.toLowerCase().includes(searchLower)
    );
  });

  const eventTypes = ["all", "charge.success", "transfer.success", "transfer.failed", "dedicatedaccount.assign.success"];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search webhooks..."
            className="pl-10 h-12 rounded-xl"
          />
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-48 h-12 rounded-xl">
            <SelectValue placeholder="Filter by event" />
          </SelectTrigger>
          <SelectContent>
            {eventTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type === "all" ? "All Events" : type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchLogs}
          className="h-12 w-12 rounded-xl"
        >
          <RefreshCw className="h-5 w-5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No webhook logs found
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="glass-card rounded-2xl p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedLog(log)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Webhook className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={cn("font-medium", getEventColor(log.event_type))}>
                          {log.event_type || "Unknown Event"}
                        </p>
                        {getEventIcon(log.event_type, log.processed)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {log.provider} • {format(new Date(log.created_at), "MMM d, yyyy HH:mm:ss")}
                      </p>
                    </div>
                  </div>
                  <div className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium",
                    log.processed ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                  )}>
                    {log.processed ? "Processed" : "Pending"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Webhook Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Details
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Event Type</p>
                <p className="font-medium">{selectedLog?.event_type || "Unknown"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Provider</p>
                <p className="font-medium">{selectedLog?.provider}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className={cn(
                  "font-medium",
                  selectedLog?.processed ? "text-success" : "text-warning"
                )}>
                  {selectedLog?.processed ? "Processed" : "Pending"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Received At</p>
                <p className="font-medium">
                  {selectedLog && format(new Date(selectedLog.created_at), "MMM d, yyyy HH:mm:ss")}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Payload</p>
              <ScrollArea className="h-64 rounded-xl bg-muted p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(selectedLog?.payload, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminWebhooksTab;
