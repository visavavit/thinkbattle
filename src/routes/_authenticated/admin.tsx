import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole, useAuth } from "@/hooks/useAuth";
import { adminKeys, type AdminStats } from "@/lib/admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AudiencePanel } from "@/components/admin/AudiencePanel";
import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { ModerationPanel } from "@/components/admin/ModerationPanel";
import { PeoplePanel } from "@/components/admin/PeoplePanel";
import { TaxonomyPanel } from "@/components/admin/TaxonomyPanel";
import { TopicQueue, TopicTable } from "@/components/admin/TopicsPanel";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — toktiang.com" },
      { name: "description", content: "Publish topics, moderate the arena and manage members." },
      { property: "og:title", content: "Admin — toktiang.com" },
      { property: "og:description", content: "toktiang.com curation dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useAdminRole(user);
  const [tab, setTab] = useState("overview");

  // drives the queue / reports badges in the tab bar
  const stats = useQuery({
    queryKey: adminKeys.stats,
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_stats");
      if (error) throw error;
      return data as unknown as AdminStats;
    },
  });

  if (loading || roleLoading) {
    return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  }

  if (!isAdmin || !user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-3xl">Admins only</h1>
        <p className="mt-2 text-muted-foreground">This area is restricted to curators.</p>
      </div>
    );
  }

  const pending = stats.data?.topics_pending ?? 0;
  const reports = stats.data?.reports_open ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-4xl">Curator dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Publish and edit topics, moderate the columns, and manage who gets to play.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="queue">Queue{pending > 0 ? ` (${pending})` : ""}</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="moderation">
            Moderation{reports > 0 ? ` (${reports})` : ""}
          </TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="taxonomy">Categories &amp; Tags</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <AdminOverview onJumpToReports={() => setTab("moderation")} />
        </TabsContent>
        <TabsContent value="queue" className="pt-4">
          <TopicQueue actorId={user.id} />
        </TabsContent>
        <TabsContent value="topics" className="pt-4">
          <TopicTable actorId={user.id} />
        </TabsContent>
        <TabsContent value="moderation" className="pt-4">
          <ModerationPanel actorId={user.id} />
        </TabsContent>
        <TabsContent value="people" className="pt-4">
          <PeoplePanel actorId={user.id} />
        </TabsContent>
        <TabsContent value="audience" className="pt-4">
          <AudiencePanel actorId={user.id} />
        </TabsContent>
        <TabsContent value="taxonomy" className="pt-4">
          <TaxonomyPanel actorId={user.id} />
        </TabsContent>
        <TabsContent value="audit" className="pt-4">
          <AuditLogPanel />
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          <SettingsPanel actorId={user.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
