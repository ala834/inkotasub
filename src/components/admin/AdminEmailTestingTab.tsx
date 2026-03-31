import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Send, Eye, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface EmailTemplate {
  id: string;
  template_key: string;
  template_name: string;
  subject: string;
  html_content: string;
}

const AdminEmailTestingTab = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase.from("email_templates").select("*").order("template_name");
      setTemplates(data || []);
      setLoading(false);
    };
    fetchTemplates();
  }, []);

  const currentTemplate = templates.find((t) => t.template_key === selectedTemplate);

  const handleSend = async () => {
    if (!currentTemplate || !recipientEmail) {
      toast({ title: "Missing fields", description: "Select a template and enter an email", variant: "destructive" });
      return;
    }
    setSending(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: { to: recipientEmail, subject: `[TEST] ${currentTemplate.subject}`, html: currentTemplate.html_content },
      });
      if (error) throw error;
      setLastResult({ success: true, message: "Test email sent successfully!" });
      toast({ title: "Sent!", description: "Test email delivered" });
    } catch (err: any) {
      setLastResult({ success: false, message: err.message || "Failed to send" });
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Send className="h-6 w-6 text-primary" /> Email Testing
        </h2>
        <p className="text-muted-foreground text-sm mt-1">Send test emails to verify templates</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Send Test Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Template</label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger><SelectValue placeholder="Choose a template" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.template_key} value={t.template_key}>{t.template_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Recipient Email</label>
            <Input type="email" placeholder="test@example.com" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSend} disabled={sending || !selectedTemplate || !recipientEmail}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send Test
            </Button>
            {currentTemplate && (
              <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
                <Eye className="h-4 w-4 mr-2" /> {showPreview ? "Hide" : "Show"} Preview
              </Button>
            )}
          </div>

          {lastResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${lastResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {lastResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {lastResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {showPreview && currentTemplate && (
        <Card>
          <CardHeader>
            <CardTitle>Preview: {currentTemplate.template_name}</CardTitle>
          </CardHeader>
          <CardContent>
            <iframe srcDoc={currentTemplate.html_content} className="w-full h-[500px] border rounded-lg bg-white" title="Preview" sandbox="" />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminEmailTestingTab;
