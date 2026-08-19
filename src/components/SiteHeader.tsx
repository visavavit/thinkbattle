import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Swords } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "./LanguageToggle";
import { NotificationBell } from "./NotificationBell";
import { SuggestTopicDialog } from "./SuggestTopicDialog";

export function SiteHeader() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin(user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useT();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <Swords className="h-6 w-6 text-primary" />
          <span className="font-display text-xl font-semibold tracking-tight text-foreground">
            {t("brand.arena")}
          </span>
        </Link>

        <nav className="ml-4 hidden gap-4 text-sm font-medium text-muted-foreground sm:flex">
          <Link to="/" className="hover:text-primary" activeProps={{ className: "text-primary" }}>
            {t("nav.feed")}
          </Link>
          <Link
            to="/browse"
            className="hover:text-primary"
            activeProps={{ className: "text-primary" }}
          >
            {t("nav.browse")}
          </Link>
          {isAdmin ? (
            <Link
              to="/admin"
              className="hover:text-primary"
              activeProps={{ className: "text-primary" }}
            >
              {t("nav.admin")}
            </Link>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle />
          <NotificationBell user={user} />
          <SuggestTopicDialog user={user} />
          {user ? (
            <Button variant="outline" size="sm" onClick={signOut}>
              {t("nav.signOut")}
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">{t("nav.signIn")}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
