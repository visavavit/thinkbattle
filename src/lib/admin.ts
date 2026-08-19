import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Fn = Database["public"]["Functions"];

export type ReportRow = Fn["admin_report_queue"]["Returns"][number];
export type AdminCommentRow = Fn["admin_comment_feed"]["Returns"][number];
export type DirectoryRow = Fn["admin_user_directory"]["Returns"][number];
export type ActivityPoint = Fn["admin_activity_series"]["Returns"][number];
export type ReportStatus = Database["public"]["Enums"]["report_status"];
export type TopicStatus = Database["public"]["Enums"]["topic_status"];

export type AdminStats = {
  topics_published: number;
  topics_pending: number;
  topics_rejected: number;
  votes_total: number;
  votes_24h: number;
  comments_total: number;
  comments_24h: number;
  comments_hidden: number;
  reports_open: number;
  users_total: number;
  users_banned: number;
  admins_total: number;
};

export const adminKeys = {
  stats: ["admin", "stats"] as const,
  activity: ["admin", "activity"] as const,
  topics: ["admin", "topics"] as const,
  taxonomy: ["admin", "taxonomy"] as const,
  reports: (status: ReportStatus) => ["admin", "reports", status] as const,
  comments: (search: string, onlyHidden: boolean) =>
    ["admin", "comments", search, onlyHidden] as const,
  people: (search: string) => ["admin", "people", search] as const,
  audit: ["admin", "audit"] as const,
};

/**
 * Append to the audit trail. Never throws: a failed log entry must not roll back
 * or mask the moderation action the admin actually took.
 */
export async function recordAudit(entry: {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  detail?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("admin_audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    summary: entry.summary ?? null,
    detail: (entry.detail ?? {}) as never,
  });
  if (error) console.warn("audit log write failed", error.message);
}

/**
 * Slug for a category or tag name. Thai letters survive as themselves: the site
 * is Thai-first, so stripping them left every Thai name with an empty slug —
 * unroutable on /browse, and a duplicate-key collision on the second one.
 * The kept character range mirrors resolve_tag_names() in the database so a tag
 * created here and one created through the topic editor land on the same slug.
 * Returns "" when a name carries no sluggable characters (all emoji, say);
 * callers must reject that rather than write it.
 */
export const slugify = (value: string) =>
  value
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0e00-\u0e7f]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function formatWhen(iso: string) {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 30) return `${Math.round(minutes / (60 * 24))}d ago`;
  return date.toLocaleDateString();
}

/** Surfaces the real Postgres message instead of a generic "something failed". */
export function describeError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes("row-level security")) return "Not permitted for your role.";
    if (message.includes("duplicate key")) return "That already exists.";
    return message;
  }
  return fallback;
}
