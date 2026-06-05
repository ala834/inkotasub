import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, Pencil, Trash2, Plus, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface PromoBanner {
  id: string;
  image_url: string;
  title: string;
  description: string | null;
  target_link: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const empty = {
  id: "",
  image_url: "",
  title: "",
  description: "",
  target_link: "",
  is_active: true,
  sort_order: 0,
};

const AdminPromoBannersTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<typeof empty>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("promo_banners")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load banners", description: error.message, variant: "destructive" });
    setBanners((data as PromoBanner[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => { setForm(empty); setEditingId(null); };

  const onUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `promo-banners/${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setForm((f) => ({ ...f, image_url: data.publicUrl }));
      toast({ title: "Image uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    if (!form.image_url || !form.title) {
      toast({ title: "Image and title required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      image_url: form.image_url,
      title: form.title,
      description: form.description || null,
      target_link: form.target_link || null,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
    };
    let error;
    if (editingId) {
      ({ error } = await supabase.from("promo_banners").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("promo_banners").insert({ ...payload, created_by: user?.id }));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Banner updated" : "Banner created" });
    setOpen(false);
    resetForm();
    load();
  };

  const onEdit = (b: PromoBanner) => {
    setEditingId(b.id);
    setForm({
      id: b.id,
      image_url: b.image_url,
      title: b.title,
      description: b.description || "",
      target_link: b.target_link || "",
      is_active: b.is_active,
      sort_order: b.sort_order,
    });
    setOpen(true);
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this banner?")) return;
    const { error } = await supabase.from("promo_banners").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    toast({ title: "Banner deleted" });
    load();
  };

  const toggleActive = async (b: PromoBanner) => {
    const { error } = await supabase.from("promo_banners").update({ is_active: !b.is_active }).eq("id", b.id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Promo Banners</h2>
          <p className="text-sm text-muted-foreground">Manage homepage promotional carousel</p>
        </div>
        <Button onClick={() => { resetForm(); setOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> New Banner
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : banners.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
            No banners yet. Create your first one.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {banners.map((b) => (
            <Card key={b.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{b.title}</CardTitle>
                  <Badge variant={b.is_active ? "default" : "secondary"}>
                    {b.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg overflow-hidden bg-muted aspect-[16/7]">
                  <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
                </div>
                {b.description && <p className="text-sm text-muted-foreground line-clamp-2">{b.description}</p>}
                {b.target_link && <p className="text-xs text-muted-foreground truncate">→ {b.target_link}</p>}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={b.is_active} onCheckedChange={() => toggleActive(b)} />
                    <span className="text-xs text-muted-foreground">Sort: {b.sort_order}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => onEdit(b)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Banner" : "New Banner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Banner Image</Label>
              {form.image_url && (
                <div className="my-2 rounded-lg overflow-hidden aspect-[16/7] bg-muted">
                  <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-4 cursor-pointer hover:bg-muted/40 transition-colors">
                <Upload className="h-4 w-4" />
                <span className="text-sm">{uploading ? "Uploading…" : "Upload image"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                  disabled={uploading}
                />
              </label>
              <Input
                className="mt-2"
                placeholder="Or paste image URL"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </div>
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Target link (optional)</Label>
              <Input
                placeholder="/referrals or https://…"
                value={form.target_link}
                onChange={(e) => setForm({ ...form, target_link: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <span className="text-sm">Active</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={onSave} disabled={saving || uploading}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPromoBannersTab;
