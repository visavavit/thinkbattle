import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { adminKeys, describeError, recordAudit } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/TagInput";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const topicSchema = z.object({
  title: z.string().trim().min(6, "Title needs at least 6 characters").max(140),
  description: z.string().trim().max(300).optional(),
  choice_a: z.string().trim().min(1, "Choice A is required").max(60),
  choice_b: z.string().trim().min(1, "Choice B is required").max(60),
  cover_image_url: z.string().trim().max(500).optional(),
});

export type EditableTopic = {
  id: string;
  title: string;
  description: string | null;
  choice_a: string;
  choice_b: string;
  category_id: string | null;
  cover_image_url: string | null;
};

const EMPTY = {
  title: "",
  description: "",
  choice_a: "",
  choice_b: "",
  cover_image_url: "",
};

/**
 * Create or edit a topic. `topic` null means "create new".
 * `publishOnSave` publishes straight from the queue after fixing up a suggestion.
 */
export function TopicEditorDialog({
  topic,
  open,
  onOpenChange,
  actorId,
  publishOnSave = false,
}: {
  topic: EditableTopic | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorId: string;
  publishOnSave?: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tagNames, setTagNames] = useState<string[]>([]);

  const taxonomy = useQuery({
    queryKey: adminKeys.taxonomy,
    queryFn: async () => {
      const [cats, tags] = await Promise.all([
        supabase.from("categories").select("id, name, slug, emoji").order("name"),
        supabase.from("tags").select("id, name, slug").order("name"),
      ]);
      if (cats.error) throw cats.error;
      if (tags.error) throw tags.error;
      return { categories: cats.data ?? [], tags: tags.data ?? [] };
    },
  });

  const existingTags = useQuery({
    queryKey: ["admin", "topic-tags", topic?.id ?? "new"],
    enabled: open && Boolean(topic?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topic_tags")
        .select("tags(name)")
        .eq("topic_id", topic!.id);
      if (error) throw error;
      return (data ?? [])
        .map((r) => (r.tags as { name: string } | null)?.name)
        .filter((n): n is string => Boolean(n));
    },
  });

  useEffect(() => {
    if (!open) return;
    setForm(
      topic
        ? {
            title: topic.title,
            description: topic.description ?? "",
            choice_a: topic.choice_a,
            choice_b: topic.choice_b,
            cover_image_url: topic.cover_image_url ?? "",
          }
        : EMPTY,
    );
    setCategoryId(topic?.category_id ?? null);
    setTagNames([]);
  }, [open, topic]);

  useEffect(() => {
    if (existingTags.data) setTagNames(existingTags.data);
  }, [existingTags.data]);


  const save = useMutation({
    mutationFn: async () => {
      const parsed = topicSchema.safeParse(form);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      }
      const values = {
        title: parsed.data.title,
        description: parsed.data.description || null,
        choice_a: parsed.data.choice_a,
        choice_b: parsed.data.choice_b,
        cover_image_url: parsed.data.cover_image_url || null,
        category_id: categoryId,
      };

      let topicId = topic?.id ?? null;
      if (topicId) {
        const patch = publishOnSave
          ? {
              ...values,
              status: "published" as const,
              published_at: new Date().toISOString(),
              reviewed_by: actorId,
              reviewed_at: new Date().toISOString(),
            }
          : values;
        const { error } = await supabase.from("topics").update(patch).eq("id", topicId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("topics")
          .insert({
            ...values,
            status: "published",
            published_at: new Date().toISOString(),
            submitted_by: actorId,
            reviewed_by: actorId,
            reviewed_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (error) throw error;
        topicId = data.id;
      }

      // replace the tag set wholesale — simpler to reason about than a diff
      await supabase.from("topic_tags").delete().eq("topic_id", topicId);
      if (tagNames.length > 0) {
        const { data: ids, error: tagError } = await supabase.rpc("resolve_tag_names", {
          _names: tagNames,
        });
        if (tagError) throw tagError;
        if (ids && ids.length > 0) {
          const { error } = await supabase
            .from("topic_tags")
            .insert(ids.map((tag_id: string) => ({ topic_id: topicId!, tag_id })));
          if (error) throw error;
        }
      }

      await recordAudit({
        actorId,
        action: topic
          ? publishOnSave
            ? "topic.approve_with_edits"
            : "topic.update"
          : "topic.create",
        entityType: "topic",
        entityId: topicId,
        summary: values.title,
        detail: { tags: tagNames.length, category_id: categoryId },

      });
      return topicId;
    },
    onSuccess: () => {
      toast.success(topic ? "Topic saved" : "Topic published 🔥");
      queryClient.invalidateQueries({ queryKey: adminKeys.topics });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats });
      queryClient.invalidateQueries({ queryKey: adminKeys.audit });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(describeError(error, "Could not save the topic")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{topic ? "Edit topic" : "Publish a new topic"}</DialogTitle>
          <DialogDescription>
            {publishOnSave
              ? "Tidy up the suggestion, then approve it straight onto the feed."
              : "Title, choices, artwork, category and tags."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="editor-title">Title</Label>
            <Input
              id="editor-title"
              value={form.title}
              maxLength={140}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="editor-desc">Description</Label>
            <Textarea
              id="editor-desc"
              value={form.description}
              maxLength={300}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="editor-a" className="text-side-a">
                Choice A
              </Label>
              <Input
                id="editor-a"
                value={form.choice_a}
                maxLength={60}
                onChange={(e) => setForm({ ...form, choice_a: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="editor-b" className="text-side-b">
                Choice B
              </Label>
              <Input
                id="editor-b"
                value={form.choice_b}
                maxLength={60}
                onChange={(e) => setForm({ ...form, choice_b: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="editor-cover">Cover image URL</Label>
            <Input
              id="editor-cover"
              value={form.cover_image_url}
              placeholder="/covers/pineapple.jpg"
              onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })}
            />
            {form.cover_image_url ? (
              <img
                src={form.cover_image_url}
                alt=""
                className="mt-2 aspect-[21/9] w-full rounded-md object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
          </div>

          <div>
            <Label>Category</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(taxonomy.data?.categories ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                  className={`rounded-sm border px-2 py-1 text-xs font-bold ${
                    categoryId === c.id
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
            <TagInput value={tagNames} onChange={setTagNames} />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : publishOnSave ? "Approve & publish" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
