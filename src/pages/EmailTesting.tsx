import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, Eye, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface EmailTemplate {
  id: string;
  template_key: string;
  template_name: string;
  subject: string;
  html_content: string;
}

const EmailTesting = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase.from('email_templates').select('*').order('created_at');
      setTemplates(data || []);
      if (data && data.length > 0) setSelectedKey(data[0].template_key);
    };
    fetchTemplates();
  }, []);

  const selectedTemplate = templates.find(t => t.template_key === selectedKey);

  const handleSend = async () => {
    if (!recipientEmail || !selectedTemplate) {
      toast({ title: "Error", description: "Please select a template and enter an email", variant: "destructive" });
      return;
    }

    setSending(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: recipientEmail,
          subject: selectedTemplate.subject,
          html: selectedTemplate.html_content,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setLastResult({ success: true, message: `Email sent! Message ID: ${data.messageId}` });
        toast({ title: "Success", description: "Test email sent successfully!" });
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to send email';
      setLastResult({ success: false, message: msg });
      toast({ title: "Failed", description: msg, variant: "destructive" });
    }

    setSending(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Email Testing</h1>
            <p className="text-xs text-muted-foreground">Send test emails to verify templates</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Template Selection */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1. Choose Template</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedKey} onValueChange={setSelectedKey}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.template_key} value={t.template_key}>
                    {t.template_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Recipient */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2. Destination Email</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="test@example.com"
              className="rounded-xl"
            />
          </CardContent>
        </Card>

        {/* Preview Toggle */}
        {selectedTemplate && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">3. Preview</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="rounded-lg"
              >
                <Eye className="h-4 w-4 mr-1" />
                {showPreview ? "Hide" : "Show"}
              </Button>
            </CardHeader>
            {showPreview && (
              <CardContent>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Subject: </span>
                    <span className="font-medium">{selectedTemplate.subject}</span>
                  </div>
                  <div className="border rounded-xl overflow-hidden bg-muted/30">
                    <iframe
                      srcDoc={selectedTemplate.html_content}
                      className="w-full h-[450px] border-0"
                      title="Email Preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Send Button */}
        <Button
          onClick={handleSend}
          disabled={sending || !selectedTemplate || !recipientEmail}
          className="w-full rounded-xl h-12 text-base"
        >
          {sending ? (
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          ) : (
            <Send className="h-5 w-5 mr-2" />
          )}
          Send Test Email
        </Button>

        {/* Result */}
        {lastResult && (
          <Card className={`border-0 shadow-sm ${lastResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
            <CardContent className="py-4 flex items-center gap-3">
              {lastResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 shrink-0" />
              )}
              <p className={`text-sm ${lastResult.success ? 'text-green-700' : 'text-red-700'}`}>
                {lastResult.message}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default EmailTesting;
