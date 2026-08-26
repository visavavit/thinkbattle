import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { ensureProfile, useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translate as tr, useT } from "@/lib/i18n";
import { safeReturnPath, stashReturnPath, takeStashedReturnPath } from "@/lib/return-to";
import { claimGuestVotes } from "@/lib/guest.functions";
import { authErrorKey } from "@/lib/auth-errors";
import { forgetGuestVotes } from "@/lib/guest-vote-store";

const authSearchSchema = z.object({
  // Where to go once signed in. Validated again on use — see safeReturnPath.
  // `.catch` rather than a throw: a hand-edited URL should degrade to the
  // homepage, never to an error page. Same convention as /browse.
  redirect: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/auth")({
  validateSearch: authSearchSchema,
  head: () => ({
    meta: [
      { title: tr("meta.auth.title") },
      { name: "description", content: tr("meta.auth.description") },
      { property: "og:title", content: tr("meta.auth.title") },
      { property: "og:description", content: tr("meta.auth.description") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("auth.errEmail").max(255),
  password: z.string().min(6, "auth.errPassword").max(72),
});

/** Matches the account page, the database's clean_username, and the check
 *  behind the live availability lookup. */
const USERNAME_MIN = 3;
const USERNAME_MAX = 24;

type Mode = "signin" | "signup" | "forgot";

/** Where a reset link comes back to. Must be on the Supabase auth redirect
 *  allow-list, alongside the bare origin the OAuth round trip uses. */
const RESET_PATH = "/auth/reset";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const t = useT();

  // The OAuth round trip drops component state, so a path stashed before
  // leaving wins over the query string, which will not have survived.
  const returnTo = safeReturnPath(search.redirect);

  // Fires once per real sign-in. CLAUDE.md documents Supabase re-emitting
  // SIGNED_IN on every tab refocus, so a claim hung off the raw event would
  // cost a round trip per focus, per tab.
  const claimedFor = useRef<string | null>(null);

  /**
   * Is the typed display name free?
   *
   * Debounced, and only while signing up. `undefined` means "no answer yet",
   * which is distinct from "taken" — the form only blocks on a definite no, so
   * a slow or failed lookup never stops someone creating an account. The
   * database resolves a collision by suffixing the name either way; this is
   * here so that resolution is a choice the reader makes rather than a surprise
   * they discover on their first comment.
   */
  const trimmedName = username.trim();
  const [taken, setTaken] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (mode !== "signup" || trimmedName.length < USERNAME_MIN) {
      setTaken(undefined);
      return;
    }
    setTaken(undefined);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("username_available", { _name: trimmedName });
      if (cancelled || error) return;
      setTaken(data === false);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedName, mode]);

  useEffect(() => {
    if (!user) return;
    void ensureProfile();

    if (claimedFor.current !== user.id) {
      claimedFor.current = user.id;
      // Hand this device's guest votes to the account. Best-effort: a failed
      // merge must not block the sign-in that just succeeded, and the votes
      // still count in the tally either way — they are just not attributed.
      void claimGuestVotes()
        .then(({ claimed }) => {
          if (claimed.length === 0) return;
          forgetGuestVotes(claimed);
          toast.success(t("vote.guestMerged"));
        })
        .catch(() => {});
    }

    const target = takeStashedReturnPath() ?? returnTo;
    navigate({ to: target ?? "/", replace: true });
  }, [user, navigate, returnTo, t]);

  async function submit() {
    if (mode === "forgot") return sendReset();

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const key = parsed.error.issues[0]?.message;
      toast.error(
        key === "auth.errEmail" || key === "auth.errPassword" ? t(key) : t("auth.checkDetails"),
      );
      return;
    }

    if (mode === "signup") {
      const name = username.trim();
      if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
        toast.error(t("auth.errUsername"));
        return;
      }
      // Checked here as well as at the database, because the alternative is
      // creating the account and then telling someone their name was changed
      // out from under them.
      if (taken === true) {
        toast.error(t("auth.usernameTaken"));
        return;
      }
      // Password confirmation is not ceremony on this form. There is a reset
      // flow now, but a typo still costs an email round trip to undo, and
      // before this the only cure was abandoning the account.
      if (password !== confirmPassword) {
        toast.error(t("auth.errPasswordMismatch"));
        return;
      }
    }

    setBusy(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: window.location.origin,
          // Read by the handle_new_user trigger, which is what actually writes
          // the profile row. Passing it here rather than inserting a profile
          // afterwards is what makes the chosen name survive a confirmation
          // link opened in a different browser.
          data: { username: username.trim() },
        },
      });
      setBusy(false);
      if (error) {
        toast.error(t(authErrorKey(error)));
        return;
      }
      if (!data.session) {
        toast.success(t("auth.checkEmail"));
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      setBusy(false);
      if (error) {
        toast.error(t(authErrorKey(error)));
        return;
      }
    }
  }

  /**
   * The same confirmation regardless of whether the address has an account.
   * Saying "no account with that email" turns this box into a tool for finding
   * out who is registered here, which on a site about contested politics is not
   * a small thing to hand out.
   */
  async function sendReset() {
    const parsed = schema.shape.email.safeParse(email);
    if (!parsed.success) {
      toast.error(t("auth.errEmail"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}${RESET_PATH}`,
    });
    setBusy(false);
    // A rate limit is worth surfacing — it is the one case where trying again
    // immediately is guaranteed not to work.
    if (error && authErrorKey(error) === "auth.errRateLimited") {
      toast.error(t("auth.errRateLimited"));
      return;
    }
    setSent(true);
    toast.success(t("auth.forgotSent"));
  }

  async function google() {
    // redirect_uri stays the bare origin: it is matched against Supabase's
    // auth redirect allow-list, which is configured in the dashboard, so
    // giving it a path risks breaking sign-in. The destination waits in
    // sessionStorage instead.
    stashReturnPath(returnTo);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      // The trip never happened, so drop the stash rather than leave it to be
      // picked up by a later sign-in that meant to go somewhere else.
      stashReturnPath(undefined);
      toast.error(t("auth.googleFailed"));
      return;
    }
  }

  const title =
    mode === "signin"
      ? t("auth.signInTitle")
      : mode === "signup"
        ? t("auth.signUpTitle")
        : t("auth.forgotTitle");

  function switchMode(next: Mode) {
    setMode(next);
    setSent(false);
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="arena-panel space-y-5 p-6">
        <h1 className="text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "forgot" ? t("auth.forgotSub") : t("auth.sub")}
        </p>

        <div className="space-y-3">
          <div>
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          {mode === "signup" ? (
            <div>
              <Label htmlFor="username">{t("auth.username")}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={USERNAME_MAX}
                autoComplete="nickname"
                aria-describedby="username-hint"
              />
              <p
                id="username-hint"
                className={`mt-1 text-xs ${
                  taken === true
                    ? "text-destructive"
                    : taken === false
                      ? "text-muted-foreground"
                      : "text-muted-foreground"
                }`}
              >
                {taken === true
                  ? t("auth.usernameTaken")
                  : taken === false
                    ? t("auth.usernameFree")
                    : t("auth.usernameHint")}
              </p>
            </div>
          ) : null}

          {mode === "forgot" ? null : (
            <div>
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                aria-describedby={mode === "signup" ? "password-hint" : undefined}
              />
              {/* Said up front because the project has Supabase's breached-password
                  check switched on, and it is the most common reason a sign-up is
                  refused. Discovering that rule only by being rejected — with no
                  hint that reusing a password from elsewhere is what did it — is
                  the difference between a moment's annoyance and giving up. */}
              {mode === "signup" ? (
                <p id="password-hint" className="mt-1 text-xs text-muted-foreground">
                  {t("auth.passwordHint")}
                </p>
              ) : null}
            </div>
          )}

          {mode === "signup" ? (
            <div>
              <Label htmlFor="confirm-password">{t("auth.confirmPassword")}</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              {confirmPassword.length > 0 && confirmPassword !== password ? (
                <p className="mt-1 text-xs text-destructive">{t("auth.errPasswordMismatch")}</p>
              ) : null}
            </div>
          ) : null}

          <Button
            className="w-full"
            onClick={submit}
            disabled={busy || (mode === "forgot" && sent)}
          >
            {mode === "signin"
              ? t("auth.signIn")
              : mode === "signup"
                ? t("auth.createAccount")
                : t("auth.forgotSend")}
          </Button>

          {mode === "forgot" && sent ? (
            <p className="text-sm text-muted-foreground">{t("auth.forgotSent")}</p>
          ) : null}

          {mode === "signin" ? (
            <button
              type="button"
              className="w-full text-sm text-muted-foreground underline"
              onClick={() => switchMode("forgot")}
            >
              {t("auth.forgot")}
            </button>
          ) : null}
        </div>

        {mode === "forgot" ? null : (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" /> {t("auth.or")}{" "}
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button variant="outline" className="w-full" onClick={google}>
              {t("auth.google")}
            </Button>
          </>
        )}

        <button
          type="button"
          className="w-full text-sm text-muted-foreground underline"
          onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? t("auth.toSignUp") : t("auth.toSignIn")}
        </button>
      </div>
    </div>
  );
}
