import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — VS Arena" },
      { name: "description", content: "Publish topics, manage tags and review suggestions." },
      { property: "og:title", content: "Admin — VS Arena" },
      { property: "og:description", content: "VS Arena curation dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const topicSchema = z.object({
  title: z.string().trim().min(6).max(140),
  choice_a: z.string().trim().min(1).max(60),
  choice_b: z.string().trim().min(1).max(60),
});

function AdminPage() {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin(user);
  const queryClient = useQueryClient();

  const topics = useQuery({
    queryKey: ["admin-topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("id, title, choice_a, choice_b, status, votes_a, votes_b, created_at, category_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const taxonomy = useQuery({
    queryKey: ["admin-taxonomy"],
    queryFn: async () => {
      const [cats, tags] = await Promise.all([
        supabase.from("categories").select("id, name, slug, emoji").order("name"),
        supabase.from("tags").select("id, name, slug").order("name"),
      ]);
      return { categories: cats.data ?? [], tags: tags.data ?? [] };
    },
    enabled: isAdmin,
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "published" | "rejected" }) => {
      const { error } = await supabase
        .from("topics")
        .update({
          status,
          published_at: status === "published" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      queryClient.invalidateQueries({ queryKey: ["admin-topics"] });
    },
    onError: () => toast.error("Update failed"),
  });

  const removeTopic = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-topics"] });
    },
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    choice_a: "",
    choice_b: "",
    category_id: "",
  });

  async function createTopic() {
    const parsed = topicSchema.safeParse(form);
    if (!parsed.success) {
      toast.error("Fill in a title and both choices.");
      return;
    }
    const { error } = await supabase.from("topics").insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      choice_a: form.choice_a.trim(),
      choice_b: form.choice_b.trim(),
      category_id: form.category_id || null,
      status: "published",
      published_at: new Date().toISOString(),
      submitted_by: user?.id ?? null,
    });
    if (error) {
      toast.error("Could not publish");
      return;
    }
    toast.success("Topic published 🔥");
    setForm({ title: "", description: "", choice_a: "", choice_b: "", category_id: "" });
    queryClient.invalidateQueries({ queryKey: ["admin-topics"] });
  }

  const [newCategory, setNewCategory] = useState({ name: "", emoji: "🔥" });
  const [newTag, setNewTag] = useState("");

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  async function addCategory() {
    if (newCategory.name.trim().length < 2) return;
    const { error } = await supabase.from("categories").insert({
      name: newCategory.name.trim(),
      slug: slugify(newCategory.name),
      emoji: newCategory.emoji || "🔥",
    });
    if (error) return toast.error("Could not add category");
    setNewCategory({ name: "", emoji: "🔥" });
    queryClient.invalidateQueries({ queryKey: ["admin-taxonomy"] });
  }

  async function addTag() {
    if (newTag.trim().length < 2) return;
    const { error } = await supabase
      .from("tags")
      .insert({ name: newTag.trim().toLowerCase(), slug: slugify(newTag) });
    if (error) return toast.error("Could not add tag");
    setNewTag("");
    queryClient.invalidateQueries({ queryKey: ["admin-taxonomy"] });
  }

  if (loading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-3xl">Admins only</h1>
        <p className="mt-2 text-muted-foreground">This area is restricted to curators.</p>
      </div>
    );
  }

  const pending = (topics.data ?? []).filter((t) => t.status === "pending");
  const published = (topics.data ?? []).filter((t) => t.status === "published");

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <h1 className="text-4xl">Curator dashboard</h1>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Queue ({pending.length})</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="taxonomy">Categories & Tags</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-3 pt-4">
          {pending.length === 0 ? (
            <p className="text-muted-foreground">Nothing pending. The mob is satisfied.</p>
          ) : null}
          {pending.map((t) => (
            <div key={t.id} className="arena-panel flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t.title}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="text-side-a">{t.choice_a}</span> vs{" "}
                  <span className="text-side-b">{t.choice_b}</span>
                </p>
              </div>
              <Button size="sm" onClick={() => setStatus.mutate({ id: t.id, status: "published" })}>
                Approve & publish
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatus.mutate({ id: t.id, status: "rejected" })}
              >
                Reject
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="topics" className="space-y-6 pt-4">
          <div className="arena-panel space-y-3 p-4">
            <h2 className="text-xl">Publish a new topic</h2>
            <div>
              <Label htmlFor="t-title">Title</Label>
              <Input
                id="t-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="t-desc">Description</Label>
              <Textarea
                id="t-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-side-a">Choice A</Label>
                <Input
                  value={form.choice_a}
                  onChange={(e) => setForm({ ...form, choice_a: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-side-b">Choice B</Label>
                <Input
                  value={form.choice_b}
                  onChange={(e) => setForm({ ...form, choice_b: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
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
            <Button onClick={createTopic}>Publish topic</Button>
          </div>

          <div className="space-y-2">
            {published.map((t) => (
              <div key={t.id} className="arena-panel flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.votes_a + t.votes_b} votes · {t.choice_a} vs {t.choice_b}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStatus.mutate({ id: t.id, status: "rejected" })}
                >
                  Unpublish
                </Button>
                <Button size="sm" variant="destructive" onClick={() => removeTopic.mutate(t.id)}>
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="taxonomy" className="grid gap-6 pt-4 sm:grid-cols-2">
          <div className="arena-panel space-y-3 p-4">
            <h2 className="text-xl">Categories</h2>
            <div className="flex gap-2">
              <Input
                className="w-16"
                value={newCategory.emoji}
                onChange={(e) => setNewCategory({ ...newCategory, emoji: e.target.value })}
              />
              <Input
                placeholder="Name"
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
              />
              <Button onClick={addCategory}>Add</Button>
            </div>
            <ul className="space-y-1 text-sm">
              {(taxonomy.data?.categories ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span>
                    {c.emoji} {c.name}
                  </span>
                  <button
                    className="text-xs text-muted-foreground underline"
                    onClick={async () => {
                      await supabase.from("categories").delete().eq("id", c.id);
                      queryClient.invalidateQueries({ queryKey: ["admin-taxonomy"] });
                    }}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="arena-panel space-y-3 p-4">
            <h2 className="text-xl">Tags</h2>
            <div className="flex gap-2">
              <Input
                placeholder="tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
              />
              <Button onClick={addTag}>Add</Button>
            </div>
            <ul className="flex flex-wrap gap-2 text-sm">
              {(taxonomy.data?.tags ?? []).map((t) => (
                <li key={t.id} className="rounded-full border border-border px-2 py-1">
                  #{t.name}{" "}
                  <button
                    className="text-xs text-muted-foreground underline"
                    onClick={async () => {
                      await supabase.from("tags").delete().eq("id", t.id);
                      queryClient.invalidateQueries({ queryKey: ["admin-taxonomy"] });
                    }}
                  >
                    x
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
