import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

/**
 * Cached so the header, the admin route and the discussion view share a single
 * lookup instead of each firing their own request on every mount.
 */
export function useAdminRole(user: User | null) {
  const query = useQuery({
    queryKey: ["is-admin", user?.id ?? "anon"],
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });
  return { isAdmin: query.data ?? false, loading: query.isLoading };
}

export function useIsAdmin(user: User | null) {
  return useAdminRole(user).isAdmin;
}

/** A banned user keeps read access but every write is refused by RLS. */
export function useBanStatus(user: User | null) {
  const query = useQuery({
    queryKey: ["ban-status", user?.id ?? "anon"],
    enabled: Boolean(user),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_bans")
        .select("reason, created_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return { isBanned: Boolean(query.data), reason: query.data?.reason ?? null };
}

/**
 * Makes sure the signed-in account has a profile row.
 *
 * The row is normally written by a trigger on auth.users, before any client
 * code runs at all. This is the net under that, and it exists because the
 * previous arrangement — deriving a name here and upserting it — lost accounts
 * two different ways:
 *
 *   * it ran from one effect on /auth, and Google sign-in lands on the bare
 *     origin, so it never ran for those accounts at all;
 *   * it upserted `on conflict (id)` while the uniqueness that bites is on
 *     lower(username), so two people whose email local part matched produced a
 *     silent 23505 and one of them ended up with no profile.
 *
 * So the derivation lives in the database now, and this only asks for a row to
 * exist. It never renames anyone: for an account that already has a profile it
 * is a single existence check.
 *
 * Failure is ignored on purpose. It is called on the way in to a session that
 * has already succeeded, and the migration that adds the trigger also backfills
 * anything that slipped through — so a missing row heals, while a thrown error
 * here would only break a sign-in that otherwise worked.
 */
export async function ensureProfile() {
  try {
    await supabase.rpc("ensure_my_profile");
  } catch {
    /* healed by the backfill */
  }
}
