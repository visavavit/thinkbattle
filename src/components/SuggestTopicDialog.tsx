import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const schema = z.object({
  title: z.string().trim().min(6, "Title must be at least 6 characters").max(140),
  description: z.string().trim().max(300).optional(),
  choice_a: z.string().trim().min(1, "Choice A is required").max(60),
  choice_b: z.string().trim().min(1, "Choice B is required").max(60),
  category_id: z.string().uuid("Pick a category"),
});

export function SuggestTopicDialog({ user }: { user: User | null }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    choice_a: "",
    choice_b: "",
    category_id: "",
  });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const taxonomy = useQuery({
    queryKey: ["taxonomy"],
    queryFn: async () => {
      const [cats, tags] = await Promise.all([
        supabase.from("categories").select("id, name, emoji").order("name"),
        supabase.from("tags").select("id, name").order("name"),
      ]);
      return { categories: cats.data ?? [], tags: tags.data ?? [] };
    },
  });

  async function submit() {
    if (!user) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("topics")
      .insert({
        title: parsed.data.title,
        description: parsed.data.description || null,
        choice_a: parsed.data.choice_a,
        choice_b: parsed.data.choice_b,
        category_id: parsed.data.category_id,
        submitted_by: user.id,
        status: "pending",
      })
      .select("id")
      .single();
    if (!error && data && tagIds.length > 0) {
      await supabase
        .from("topic_tags")
        .insert(tagIds.map((tag_id) => ({ topic_id: data.id, tag_id })));
    }
    setSaving(false);
    if (error) {
      toast.error("Could not submit your idea.");
      return;
    }
    toast.success("Sent to the moderation queue 🔥");
    setForm({ title: "", description: "", choice_a: "", choice_b: "", category_id: "" });
    setTagIds([]);
    setOpen(false);
  }

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Lightbulb className="mr-1 h-4 w-4" /> Suggest
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suggest a showdown</DialogTitle>
          <DialogDescription>
            Admins review every suggestion before it hits the feed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              maxLength={140}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Cereal before milk or milk before cereal?"
            />
          </div>
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={form.description}
              maxLength={300}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="a" className="text-side-a">
                Choice A
              </Label>
              <Input
                id="a"
                value={form.choice_a}
                maxLength={60}
                onChange={(e) => setForm({ ...form, choice_a: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="b" className="text-side-b">
                Choice B
              </Label>
              <Input
                id="b"
                value={form.choice_b}
                maxLength={60}
                onChange={(e) => setForm({ ...form, choice_b: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(taxonomy.data?.categories ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setForm({ ...form, category_id: c.id })}
                  className={`rounded-sm border px-2 py-1 text-xs font-bold ${
                    form.category_id === c.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Tags</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(taxonomy.data?.tags ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setTagIds((prev) =>
                      prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id],
                    )
                  }
                  className={`rounded-full border px-2 py-1 text-xs ${
                    tagIds.includes(t.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  #{t.name}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={submit} disabled={saving} className="w-full">
            Submit for review
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
