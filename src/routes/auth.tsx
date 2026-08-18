import { useEffect, useState } from "react";
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

export const Route = createFileRoute("/auth")({
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

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useT();

  useEffect(() => {
    if (user) {
      ensureProfile(user);
      navigate({ to: "/", replace: true });
    }
  }, [user, navigate]);

  async function submit() {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const key = parsed.error.issues[0]?.message;
      toast.error(
        key === "auth.errEmail" || key === "auth.errPassword" ? t(key) : t("auth.checkDetails"),
      );
      return;
    }
    setBusy(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { emailRedirectTo: window.location.origin },
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
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
        toast.error(error.message);
        return;
      }
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(t("auth.googleFailed"));
      return;
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="arena-panel space-y-5 p-6">
        <h1 className="text-3xl">{mode === "signin" ? t("auth.signInTitle") : t("auth.signUpTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.sub")}</p>

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
          <div>
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>
          <Button className="w-full" onClick={submit} disabled={busy}>
            {mode === "signin" ? t("auth.signIn") : t("auth.createAccount")}
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" /> {t("auth.or")} <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" className="w-full" onClick={google}>
          {t("auth.google")}
        </Button>

        <button
          type="button"
          className="w-full text-sm text-muted-foreground underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? t("auth.toSignUp") : t("auth.toSignIn")}
        </button>
      </div>
    </div>
  );
}
