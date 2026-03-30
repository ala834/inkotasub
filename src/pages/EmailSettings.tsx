import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Mail, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EmailTemplate {
  id: string;
  template_key: string;
  template_name: string;
  subject: string;
  html_content: string;
  updated_at: string;
}

const EmailSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editedTemplates, setEditedTemplates] = useState<Record<string, { subject: string; html_content: string }>>({});

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at');

    if (error) {
      toast({ title: "Error", description: "Failed to load email templates", variant: "destructive" });
    } else {
      setTemplates(data || []);
      const edited: Record<string, { subject: string; html_content: string }> = {};
      (data || []).forEach((t: EmailTemplate) => {
        edited[t.template_key] = { subject: t.subject, html_content: t.html_content };
      });
      setEditedTemplates(edited);
    }
    setLoading(false);
  };

  const handleSave = async (template: EmailTemplate) => {
    const edited = editedTemplates[template.template_key];
    if (!edited) return;

    setSaving(template.template_key);
    const { error } = await supabase
      .from('email_templates')
      .update({ subject: edited.subject, html_content: edited.html_content })
      .eq('id', template.id);

    if (error) {
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `${template.template_name} updated successfully` });
      fetchTemplates();
    }
    setSaving(null);
  };

  const updateField = (key: string, field: 'subject' | 'html_content', value: string) => {
    setEditedTemplates(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }));
  };

  const templateIcons: Record<string, string> = {
    welcome: "👋",
    otp_verification: "🔐",
    password_reset: "🔑",
    payment_receipt: "💰",
    subscription_confirmation: "🎉",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Email Templates</h1>
            <p className="text-xs text-muted-foreground">Customize your email templates</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Tabs defaultValue={templates[0]?.template_key || "welcome"}>
          <TabsList className="w-full flex overflow-x-auto gap-1 bg-muted/50 p-1 rounded-xl">
            {templates.map((t) => (
              <TabsTrigger
                key={t.template_key}
                value={t.template_key}
                className="text-xs whitespace-nowrap rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                {templateIcons[t.template_key] || "📧"} {t.template_name.split(" ")[0]}
              </TabsTrigger>
            ))}
          </TabsList>

          {templates.map((template) => (
            <TabsContent key={template.template_key} value={template.template_key}>
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    {template.template_name}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Last updated: {new Date(template.updated_at).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Subject Line</label>
                    <Input
                      value={editedTemplates[template.template_key]?.subject || ""}
                      onChange={(e) => updateField(template.template_key, 'subject', e.target.value)}
                      placeholder="Email subject..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">HTML Content</label>
                    <Textarea
                      value={editedTemplates[template.template_key]?.html_content || ""}
                      onChange={(e) => updateField(template.template_key, 'html_content', e.target.value)}
                      placeholder="Paste HTML email template..."
                      className="min-h-[300px] font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Preview</label>
                    <div className="border rounded-xl overflow-hidden bg-muted/30">
                      <iframe
                        srcDoc={editedTemplates[template.template_key]?.html_content || ""}
                        className="w-full h-[400px] border-0"
                        title="Email Preview"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={() => handleSave(template)}
                    disabled={saving === template.template_key}
                    className="w-full rounded-xl"
                  >
                    {saving === template.template_key ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Template
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
};

export default EmailSettings;
