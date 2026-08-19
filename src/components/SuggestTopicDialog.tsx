import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { describeError } from "@/lib/admin";

import { useBanStatus } from "@/hooks/useAuth";
import { TagInput } from "@/components/TagInput";
import { useI18n } from "@/lib/i18n";

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
  title: z.string().trim().min(6, "suggest.errTitle").max(140),
  description: z.string().trim().max(2000).optional(),
  choice_a: z.string().trim().min(1, "suggest.errChoiceA").max(60),
  choice_b: z.string().trim().min(1, "suggest.errChoiceB").max(60),
  category_id: z.string().uuid("suggest.errCategory"),
});

export function SuggestTopicDialog({ user }: { user: User | null }) {
  const { isBanned } = useBanStatus(user);
  const { t, tError } = useI18n();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    choice_a: "",
    choice_b: "",
    category_id: "",
  });
  const [tagNames, setTagNames] = useState<string[]>([]);
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
      const key = parsed.error.issues[0]?.message;
      const known = ["suggest.errTitle", "suggest.errChoiceA", "suggest.errChoiceB", "suggest.errCategory"] as const;
      type Known = (typeof known)[number];
      toast.error(
        known.includes(key as Known) ? t(key as Known) : t("suggest.checkForm"),
      );
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
    if (!error && data && tagNames.length > 0) {
      const { data: ids } = await supabase.rpc("resolve_tag_names", { _names: tagNames });
      if (ids && ids.length > 0) {
        await supabase
          .from("topic_tags")
          .insert(ids.map((tag_id: string) => ({ topic_id: data.id, tag_id })));
      }
    }
    setSaving(false);
    if (error) {
      toast.error(tError(describeError(error, t("suggest.failed"))));
      return;
    }

    toast.success(t("suggest.sent"));
    setForm({ title: "", description: "", choice_a: "", choice_b: "", category_id: "" });
    setTagNames([]);

    setOpen(false);
  }

  if (!user || isBanned) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Lightbulb className="mr-1 h-4 w-4" /> {t("suggest.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("suggest.title")}</DialogTitle>
          <DialogDescription>{t("suggest.body")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="title">{t("suggest.fieldTitle")}</Label>
            <Input
              id="title"
              value={form.title}
              maxLength={140}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("suggest.titlePlaceholder")}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="description">{t("suggest.description")}</Label>
              <span className="text-muted-foreground text-xs">{form.description.length}/2000</span>
            </div>
            <Textarea
              id="description"
              value={form.description}
              maxLength={2000}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="a" className="text-side-a">
                {t("suggest.choiceA")}
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
                {t("suggest.choiceB")}
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
            <Label>{t("suggest.category")}</Label>
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
            <Label>{t("suggest.tags")}</Label>
            <TagInput value={tagNames} onChange={setTagNames} />
          </div>

          <Button onClick={submit} disabled={saving} className="w-full">
            {t("suggest.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
