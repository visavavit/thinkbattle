import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import logoAsset from "@/assets/toktiang-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-4">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img
            src={logoAsset.url}
            alt=""
            className="h-8 w-8 shrink-0 object-contain"
            width={32}
            height={32}
          />
          <span className="font-display text-lg font-semibold tracking-tight whitespace-nowrap text-foreground sm:text-xl">
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

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <LanguageToggle />
          <NotificationBell user={user} />
          <SuggestTopicDialog user={user} />
          {user ? (
            // Account and sign-out move into the menu below the sm breakpoint;
            // the row is already full with the language toggle, bell and suggest.
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link to="/account">{t("nav.account")}</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={signOut}
                className="hidden sm:inline-flex"
              >
                {t("nav.signOut")}
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">{t("nav.signIn")}</Link>
            </Button>
          )}

          {/* Mobile menu: the nav links are hidden below sm, so they live here. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="px-2 sm:hidden"
                aria-label={t("nav.menu")}
              >
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link to="/">{t("nav.feed")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/browse">{t("nav.browse")}</Link>
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem asChild>
                  <Link to="/admin">{t("nav.admin")}</Link>
                </DropdownMenuItem>
              ) : null}
              {user ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/account">{t("nav.account")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void signOut()}>
                    {t("nav.signOut")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
