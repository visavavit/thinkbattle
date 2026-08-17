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

export async function ensureProfile(user: User) {
  const username =
    (user.user_metadata?.["username"] as string | undefined) ??
    (user.user_metadata?.["full_name"] as string | undefined) ??
    user.email?.split("@")[0] ??
    "debater";
  await supabase
    .from("profiles")
    .upsert({ id: user.id, username }, { onConflict: "id", ignoreDuplicates: true });
}
