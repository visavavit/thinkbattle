import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translate as tr, useT } from "@/lib/i18n";
import { authErrorKey } from "@/lib/auth-errors";

/**
 * Where a password reset link lands.
 *
 * The underscore in the filename un-nests this from `auth.tsx`: it is
 * `/auth/reset` in the URL but a sibling route, so the sign-in page does not
 * have to become a layout with an outlet just to host it.
 *
 * `noindex` because there is nothing here for anyone without a live recovery
 * link, and a reset form in search results is a phishing template.
 */
export const Route = createFileRoute("/auth_/reset")({
  head: () => ({
    meta: [{ title: tr("auth.resetTitle") }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ResetPage,
});

/** Matches the sign-up form and Supabase's own floor. */
const PASSWORD_MIN = 6;

function ResetPage() {
  const t = useT();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // undefined while we are still finding out; false once we know there is no
  // recovery session to act on.
  const [ready, setReady] = useState<boolean | undefined>(undefined);

  /**
   * Supabase turns the token in the link into a session before any of our code
   * runs, and announces it as PASSWORD_RECOVERY. But by the time this component
   * mounts that event may already have fired, so the listener alone would miss
   * it on a fast load — hence also asking getSession outright. Whichever
   * answers first wins.
   */
  useEffect(() => {
    let settled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        settled = true;
        setReady(true);
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (settled) return;
      setReady(Boolean(data.session));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function save() {
    if (password.length < PASSWORD_MIN) {
      toast.error(t("auth.errPassword"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("auth.errPasswordMismatch"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(t(authErrorKey(error)));
      return;
    }
    toast.success(t("auth.resetDone"));
    // The recovery link signs them in, so there is nowhere to send them but on.
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="arena-panel space-y-5 p-6">
        <h1 className="text-3xl">{t("auth.resetTitle")}</h1>

        {ready === undefined ? (
          <p className="text-sm text-muted-foreground">{t("auth.resetChecking")}</p>
        ) : ready === false ? (
          <>
            <p className="text-sm text-muted-foreground">{t("auth.resetExpired")}</p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth">{t("auth.backToSignIn")}</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("auth.resetSub")}</p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="new-password">{t("auth.resetNew")}</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  autoFocus
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label htmlFor="confirm-new-password">{t("auth.confirmPassword")}</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                {confirmPassword.length > 0 && confirmPassword !== password ? (
                  <p className="mt-1 text-xs text-destructive">{t("auth.errPasswordMismatch")}</p>
                ) : null}
              </div>
              <Button
                className="w-full"
                onClick={save}
                disabled={busy || password.length < PASSWORD_MIN || password !== confirmPassword}
              >
                {t("auth.resetSave")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
