import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminKeys, describeError, recordAudit, slugify } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmAction } from "./ConfirmAction";

type Category = { id: string; name: string; slug: string; emoji: string };
type Tag = { id: string; name: string; slug: string };

export function TaxonomyPanel({ actorId }: { actorId: string }) {
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState({ name: "", emoji: "🔥" });
  const [newTag, setNewTag] = useState("");
  const [editing, setEditing] = useState<{
    kind: "category" | "tag";
    id: string;
    value: string;
  } | null>(null);

  const taxonomy = useQuery({
    queryKey: adminKeys.taxonomy,
    queryFn: async () => {
      const [cats, tags] = await Promise.all([
        supabase.from("categories").select("id, name, slug, emoji").order("name"),
        supabase.from("tags").select("id, name, slug").order("name"),
      ]);
      if (cats.error) throw cats.error;
      if (tags.error) throw tags.error;
      return { categories: (cats.data ?? []) as Category[], tags: (tags.data ?? []) as Tag[] };
    },
  });

  // usage counts so an admin can see what a delete would orphan
  const usage = useQuery({
    queryKey: ["admin", "taxonomy-usage"],
    queryFn: async () => {
      const [topics, topicTags] = await Promise.all([
        supabase.from("topics").select("category_id"),
        supabase.from("topic_tags").select("tag_id"),
      ]);
      const byCategory = new Map<string, number>();
      for (const row of topics.data ?? []) {
        if (row.category_id)
          byCategory.set(row.category_id, (byCategory.get(row.category_id) ?? 0) + 1);
      }
      const byTag = new Map<string, number>();
      for (const row of topicTags.data ?? []) {
        byTag.set(row.tag_id, (byTag.get(row.tag_id) ?? 0) + 1);
      }
      return { byCategory, byTag };
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.taxonomy });
    queryClient.invalidateQueries({ queryKey: ["admin", "taxonomy-usage"] });
    queryClient.invalidateQueries({ queryKey: adminKeys.audit });
    queryClient.invalidateQueries({ queryKey: ["taxonomy"] });
    queryClient.invalidateQueries({ queryKey: ["taxonomy-public"] });
    queryClient.invalidateQueries({ queryKey: ["feed"] });
  };

  const addCategory = useMutation({
    mutationFn: async () => {
      const name = newCategory.name.trim();
      if (name.length < 2) throw new Error("Name is too short");
      const slug = slugify(name);
      if (!slug) throw new Error("Name needs letters or numbers");
      const { error } = await supabase
        .from("categories")
        .insert({ name, slug, emoji: newCategory.emoji.trim() || "🔥" });
      if (error) throw error;
      await recordAudit({
        actorId,
        action: "category.create",
        entityType: "category",
        summary: name,
      });
    },
    onSuccess: () => {
      setNewCategory({ name: "", emoji: "🔥" });
      toast.success("Category added");
      invalidate();
    },
    onError: (error) => toast.error(describeError(error, "Could not add category")),
  });

  const addTag = useMutation({
    mutationFn: async () => {
      const name = newTag.trim().toLowerCase();
      if (name.length < 2) throw new Error("Tag is too short");
      const slug = slugify(name);
      if (!slug) throw new Error("Tag needs letters or numbers");
      const { error } = await supabase.from("tags").insert({ name, slug });
      if (error) throw error;
      await recordAudit({ actorId, action: "tag.create", entityType: "tag", summary: name });
    },
    onSuccess: () => {
      setNewTag("");
      toast.success("Tag added");
      invalidate();
    },
    onError: (error) => toast.error(describeError(error, "Could not add tag")),
  });

  const rename = useMutation({
    mutationFn: async ({
      kind,
      id,
      value,
    }: {
      kind: "category" | "tag";
      id: string;
      value: string;
    }) => {
      const name = kind === "tag" ? value.trim().toLowerCase() : value.trim();
      if (name.length < 2) throw new Error("Name is too short");
      const slug = slugify(name);
      if (!slug) throw new Error("Name needs letters or numbers");
      const table = kind === "category" ? "categories" : "tags";
      const { error } = await supabase.from(table).update({ name, slug }).eq("id", id);
      if (error) throw error;
      await recordAudit({
        actorId,
        action: `${kind}.rename`,
        entityType: kind,
        entityId: id,
        summary: name,
      });
    },
    onSuccess: () => {
      setEditing(null);
      toast.success("Renamed");
      invalidate();
    },
    onError: (error) => toast.error(describeError(error, "Could not rename")),
  });

  const remove = useMutation({
    mutationFn: async ({
      kind,
      id,
      name,
    }: {
      kind: "category" | "tag";
      id: string;
      name: string;
    }) => {
      const table = kind === "category" ? "categories" : "tags";
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      await recordAudit({
        actorId,
        action: `${kind}.delete`,
        entityType: kind,
        entityId: id,
        summary: name,
      });
    },
    onSuccess: () => {
      toast.success("Removed");
      invalidate();
    },
    onError: (error) => toast.error(describeError(error, "Could not remove")),
  });

  if (taxonomy.isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="arena-panel space-y-3 p-4">
        <h2 className="text-xl">Categories</h2>
        <div className="flex gap-2">
          <Input
            className="w-16"
            aria-label="Category emoji"
            value={newCategory.emoji}
            onChange={(e) => setNewCategory({ ...newCategory, emoji: e.target.value })}
          />
          <Input
            placeholder="Name"
            value={newCategory.name}
            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addCategory.mutate()}
          />
          <Button onClick={() => addCategory.mutate()} disabled={addCategory.isPending}>
            Add
          </Button>
        </div>
        <ul className="space-y-2 text-sm">
          {taxonomy.data?.categories.map((c) => {
            const count = usage.data?.byCategory.get(c.id) ?? 0;
            const isEditing = editing?.kind === "category" && editing.id === c.id;
            return (
              <li key={c.id} className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <Input
                      className="h-8"
                      value={editing.value}
                      autoFocus
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && rename.mutate(editing)}
                    />
                    <Button size="sm" variant="ghost" onClick={() => rename.mutate(editing)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1">
                      {c.emoji} {c.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{count} topics</span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Rename ${c.name}`}
                      onClick={() => setEditing({ kind: "category", id: c.id, value: c.name })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <ConfirmAction
                      trigger={
                        <button className="text-xs text-muted-foreground underline">remove</button>
                      }
                      title={`Remove "${c.name}"?`}
                      description={
                        count > 0
                          ? `${count} topic${count === 1 ? "" : "s"} will lose this category but stay published.`
                          : "Nothing is using this category."
                      }
                      confirmLabel="Remove"
                      destructive
                      onConfirm={() => remove.mutate({ kind: "category", id: c.id, name: c.name })}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="arena-panel space-y-3 p-4">
        <h2 className="text-xl">Tags</h2>
        <div className="flex gap-2">
          <Input
            placeholder="tag"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTag.mutate()}
          />
          <Button onClick={() => addTag.mutate()} disabled={addTag.isPending}>
            Add
          </Button>
        </div>
        <ul className="space-y-2 text-sm">
          {taxonomy.data?.tags.map((t) => {
            const count = usage.data?.byTag.get(t.id) ?? 0;
            const isEditing = editing?.kind === "tag" && editing.id === t.id;
            return (
              <li key={t.id} className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <Input
                      className="h-8"
                      value={editing.value}
                      autoFocus
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && rename.mutate(editing)}
                    />
                    <Button size="sm" variant="ghost" onClick={() => rename.mutate(editing)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1">#{t.name}</span>
                    <span className="text-xs text-muted-foreground">{count} topics</span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Rename ${t.name}`}
                      onClick={() => setEditing({ kind: "tag", id: t.id, value: t.name })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <ConfirmAction
                      trigger={
                        <button className="text-xs text-muted-foreground underline">remove</button>
                      }
                      title={`Remove #${t.name}?`}
                      description={
                        count > 0
                          ? `It will be stripped from ${count} topic${count === 1 ? "" : "s"}.`
                          : "Nothing is using this tag."
                      }
                      confirmLabel="Remove"
                      destructive
                      onConfirm={() => remove.mutate({ kind: "tag", id: t.id, name: t.name })}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
