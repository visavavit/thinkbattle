import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { safeReturnPath } from "@/lib/return-to";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Carry the destination, so a logged-out deep link to /account or
      // /admin resumes there instead of dropping the reader on the homepage.
      const redirectTo = safeReturnPath(location.href);
      throw redirect({
        to: "/auth",
        ...(redirectTo ? { search: { redirect: redirectTo } } : {}),
      });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
