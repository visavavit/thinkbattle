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
  error: {
    message?: string | undefined;
    code?: string | undefined;
    /** Present on supabase-js's AuthWeakPasswordError. */
    reasons?: string[] | undefined;
  } | null,
): TranslationKey {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();
  const reasons = error?.reasons ?? [];

  // Checked before the generic password branch below, because this project has
  // Supabase's HaveIBeenPwned check switched on and it is by far the most
  // common way a sign-up is refused: any password that has appeared in a public
  // breach is rejected, however long it is. Telling that person their password
  // is "too short" — as the length-only branch would — sends them to fix a
  // thing that is not wrong, and there is no length they can reach that fixes
  // it. The two reasons arrive together when both apply, and "pwned" is the one
  // worth naming.
  if (reasons.includes("pwned") || message.includes("known to be weak")) {
    return "auth.errPasswordPwned";
  }
  if (
    code === "weak_password" &&
    !reasons.includes("length") &&
    !message.includes("should be at least")
  ) {
    return "auth.errPasswordWeak";
  }

  // Regex rather than a substring: Supabase's wording is "has already *been*
  // registered", which `includes("already registered")` silently misses.
  if (code === "user_already_exists" || /already (been )?registered/.test(message)) {
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
    reasons.includes("length") ||
    message.includes("password should be at least") ||
    message.includes("password is too short")
  ) {
    return "auth.errPassword";
  }
  if (
    code === "email_address_invalid" ||
    message.includes("invalid email") ||
    message.includes("unable to validate email")
  ) {
    return "auth.errEmail";
  }
  if (code === "signup_disabled" || message.includes("signups not allowed")) {
    return "auth.errSignupDisabled";
  }

  // The reader gets a generic line, but the original does not vanish. Replacing
  // toast.error(error.message) with a translated string took away the only
  // place an unrecognised failure was visible — which is how a 422 whose body
  // said "weak_password / pwned" reached a user as "Something went wrong".
  // Anything that lands here is a case this map should learn.
  console.error("[auth] unmapped error", error);
  return "auth.errGeneric";
}
