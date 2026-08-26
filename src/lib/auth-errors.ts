import type { TranslationKey } from "@/lib/i18n";

/**
 * Maps a Supabase auth error onto one of our own translation keys.
 *
 * Two reasons not to surface `error.message` directly, which is what this
 * replaces. It is English-only, on a site whose whole interface is bilingual —
 * a Thai reader hitting a wrong password got a sentence in a language the rest
 * of the page is not in. And it is written for a developer: "Invalid login
 * credentials" tells a reader nothing about what to do next.
 *
 * Matching on the message string is unlovely, but Supabase's `code` field is
 * newer than several of these and not populated for all of them, so the text is
 * what is reliably there. Anything unrecognised falls through to a generic
 * line rather than leaking the raw string.
 */
export function authErrorKey(
  error: { message?: string | undefined; code?: string | undefined } | null,
): TranslationKey {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();

  if (code === "user_already_exists" || message.includes("already registered")) {
    return "auth.errEmailTaken";
  }
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "auth.errInvalidLogin";
  }
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "auth.errNotConfirmed";
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return "auth.errRateLimited";
  }
  if (
    message.includes("password should be at least") ||
    message.includes("password is too short")
  ) {
    return "auth.errPassword";
  }
  return "auth.errGeneric";
}
