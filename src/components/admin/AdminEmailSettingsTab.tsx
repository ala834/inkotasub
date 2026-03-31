import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Save, Mail, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EmailTemplate {
  id: string;
  template_key: string;
  template_name: string;
  subject: string;
  html_content: string;
  updated_at: string;
}

const AdminEmailSettingsTab = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editedTemplates, setEditedTemplates] = useState<Record<string, { subject: string; html_content: string }>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase.from("email_templates").select("*").order("template_name");
    if (error) {
      toast({ title: "Error", description: "Failed to load templates", variant: "destructive" });
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  };

  const handleEdit = (templateKey: string, field: "subject" | "html_content", value: string) => {
    setEditedTemplates((prev) => ({
      ...prev,
      [templateKey]: {
        subject: prev[templateKey]?.subject ?? templates.find((t) => t.template_key === templateKey)?.subject ?? "",
        html_content: prev[templateKey]?.html_content ?? templates.find((t) => t.template_key === templateKey)?.html_content ?? "",
        [field]: value,
      },
    }));
  };

  const handleSave = async (template: EmailTemplate) => {
    const edited = editedTemplates[template.template_key];
    if (!edited) return;
    setSaving(template.template_key);
    const { error } = await supabase
      .from("email_templates")
      .update({ subject: edited.subject, html_content: edited.html_content, updated_at: new Date().toISOString() })
      .eq("id", template.id);
    if (error) {
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `${template.template_name} updated successfully` });
      fetchTemplates();
      setEditedTemplates((prev) => {
        const next = { ...prev };
        delete next[template.template_key];
        return next;
      });
    }
    setSaving(null);
  };

  const getTemplateValue = (template: EmailTemplate, field: "subject" | "html_content") => {
    return editedTemplates[template.template_key]?.[field] ?? template[field];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" /> Email Templates
        </h2>
        <p className="text-muted-foreground text-sm mt-1">Manage email templates with dynamic variables like {"{{USER_NAME}}"}</p>
      </div>

      <Tabs defaultValue={templates[0]?.template_key} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          {templates.map((t) => (
            <TabsTrigger key={t.template_key} value={t.template_key} className="text-xs">
              {t.template_name}
            </TabsTrigger>
          ))}
        </TabsList>

        {templates.map((template) => (
          <TabsContent key={template.template_key} value={template.template_key}>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{template.template_name}</CardTitle>
                  <CardDescription>Last updated: {new Date(template.updated_at).toLocaleDateString()}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Subject</label>
                    <Input
                      value={getTemplateValue(template, "subject")}
                      onChange={(e) => handleEdit(template.template_key, "subject", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">HTML Content</label>
                    <Textarea
                      value={getTemplateValue(template, "html_content")}
                      onChange={(e) => handleEdit(template.template_key, "html_content", e.target.value)}
                      rows={16}
                      className="font-mono text-xs"
                    />
                  </div>
                  <Button
                    onClick={() => handleSave(template)}
                    disabled={!editedTemplates[template.template_key] || saving === template.template_key}
                  >
                    {saving === template.template_key ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Changes
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <iframe
                    srcDoc={getTemplateValue(template, "html_content")}
                    className="w-full h-[500px] border rounded-lg bg-white"
                    title="Email Preview"
                    sandbox=""
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default AdminEmailSettingsTab;
