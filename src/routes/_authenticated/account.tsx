import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { deleteMyAccount } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ImageUploadButton } from "@/components/ImageUploadButton";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "บัญชีของฉัน — ถกเถียง" },
      {
        name: "description",
        content: "Manage your display name, avatar and password on toktiang.com.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const t = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runDelete = useServerFn(deleteMyAccount);

  const profileQuery = useQuery({
    queryKey: ["my-profile", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!profileQuery.data) return;
    setUsername(profileQuery.data.username ?? "");
    setAvatarUrl(profileQuery.data.avatar_url ?? null);
  }, [profileQuery.data]);

  const email = user?.email ?? "";
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];
  const hasPasswordLogin = providers.length === 0 || providers.includes("email");

  async function saveProfile() {
    const next = username.trim();
    if (next.length < 3 || next.length > 24) {
      toast.error(t("account.errNameLength"));
      return;
    }
    setSavingProfile(true);

    // The name goes through set_my_username rather than a bare UPDATE. An
    // UPDATE matches nothing for a user whose profile row was never created,
    // returns no error, and leaves this page reporting "saved" for a change
    // that never happened — which is precisely how the missing-profile bug hid
    // itself. The function upserts, so it repairs the row instead, and it
    // reports "taken" as an outcome rather than as a constraint violation we
    // would have to recognise by its SQLSTATE.
    const { data: named, error: nameError } = await supabase.rpc("set_my_username", {
      _name: next,
    });
    const result = named?.[0];
    if (nameError || !result?.ok) {
      setSavingProfile(false);
      toast.error(
        result?.reason === "taken"
          ? t("account.errNameTaken")
          : result?.reason === "too_short"
            ? t("account.errNameLength")
            : t("account.errSaveFailed"),
      );
      return;
    }

    // The avatar is a separate write on purpose: it has none of the uniqueness
    // the name has, and folding it into the function would put an image URL
    // inside something whose job is naming.
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user!.id);
    setSavingProfile(false);
    if (error) {
      toast.error(t("account.errSaveFailed"));
      return;
    }
    toast.success(t("account.savedProfile"));
    await queryClient.invalidateQueries();
  }

  async function savePassword() {
    if (password.length < 6) {
      toast.error(t("account.errPasswordShort"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("account.errPasswordMismatch"));
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    toast.success(t("account.savedPassword"));
  }

  async function removeAccount() {
    setDeleting(true);
    try {
      await runDelete({ data: undefined });
    } catch (error) {
      setDeleting(false);
      const message = error instanceof Error ? error.message : "";
      toast.error(
        message.includes("ADMIN_CANNOT_SELF_DELETE")
          ? t("account.errAdminDelete")
          : t("account.errDeleteFailed"),
      );
      return;
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success(t("account.deleted"));
    navigate({ to: "/", replace: true });
  }

  const initials = (username || email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("account.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{email}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("account.profileTitle")}</CardTitle>
          <CardDescription>{t("account.profileHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={username} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-wrap gap-2">
              <ImageUploadButton
                folder="avatars"
                label={t("account.uploadAvatar")}
                onUploaded={(url) => setAvatarUrl(url)}
              />
              {avatarUrl ? (
                <Button variant="ghost" size="sm" onClick={() => setAvatarUrl(null)}>
                  {t("account.removeAvatar")}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-username">{t("account.displayName")}</Label>
            <Input
              id="account-username"
              value={username}
              maxLength={24}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <Button onClick={saveProfile} disabled={savingProfile || profileQuery.isLoading}>
            {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("account.save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("account.passwordTitle")}</CardTitle>
          <CardDescription>
            {hasPasswordLogin ? t("account.passwordHint") : t("account.passwordGoogle")}
          </CardDescription>
        </CardHeader>
        {hasPasswordLogin ? (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account-password">{t("account.newPassword")}</Label>
              <Input
                id="account-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-password-confirm">{t("account.confirmPassword")}</Label>
              <Input
                id="account-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            <Button onClick={savePassword} disabled={savingPassword}>
              {savingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("account.updatePassword")}
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">{t("account.deleteTitle")}</CardTitle>
          <CardDescription>{t("account.deleteHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">{t("account.deleteButton")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("account.deleteConfirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("account.deleteConfirmBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="account-delete-confirm">{t("account.deleteConfirmLabel")}</Label>
                <Input
                  id="account-delete-confirm"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder="DELETE"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("account.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={confirmText.trim().toUpperCase() !== "DELETE" || deleting}
                  onClick={(event) => {
                    event.preventDefault();
                    void removeAccount();
                  }}
                >
                  {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("account.deleteButton")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
