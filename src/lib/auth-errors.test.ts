import { describe, expect, test } from "bun:test";
import { authErrorKey } from "./auth-errors";

describe("authErrorKey", () => {
  test("recognises the errors a person can actually act on", () => {
    expect(authErrorKey({ message: "User already registered" })).toBe("auth.errEmailTaken");
    expect(authErrorKey({ message: "Invalid login credentials" })).toBe("auth.errInvalidLogin");
    expect(authErrorKey({ message: "Email not confirmed" })).toBe("auth.errNotConfirmed");
    expect(authErrorKey({ message: "email rate limit exceeded" })).toBe("auth.errRateLimited");
    expect(authErrorKey({ message: "Password should be at least 6 characters" })).toBe(
      "auth.errPassword",
    );
  });

  test("prefers the code when Supabase sends one", () => {
    expect(authErrorKey({ code: "invalid_credentials", message: "" })).toBe("auth.errInvalidLogin");
    expect(authErrorKey({ code: "user_already_exists", message: "" })).toBe("auth.errEmailTaken");
    expect(authErrorKey({ code: "over_email_send_rate_limit", message: "" })).toBe(
      "auth.errRateLimited",
    );
  });

  test("names a breached password as breached, not as too short", () => {
    // The real shape this project returns: HaveIBeenPwned checking is on, so a
    // long, unique-looking password is refused with reasons ["pwned"]. Calling
    // that "too short" sends the person to fix a thing that is not wrong.
    expect(
      authErrorKey({
        code: "weak_password",
        message: "Password is known to be weak and easy to guess, please choose a different one.",
        reasons: ["pwned"],
      }),
    ).toBe("auth.errPasswordPwned");

    // Both reasons at once — "pwned" is the one worth naming, because fixing
    // the length alone will not get them in.
    expect(
      authErrorKey({
        code: "weak_password",
        message:
          "Password should be at least 6 characters. Password is known to be weak and easy to guess, please choose a different one.",
        reasons: ["length", "pwned"],
      }),
    ).toBe("auth.errPasswordPwned");

    // Length alone stays a length problem.
    expect(
      authErrorKey({
        code: "weak_password",
        message: "Password should be at least 6 characters.",
        reasons: ["length"],
      }),
    ).toBe("auth.errPassword");
  });

  test("recognises the other ways a sign-up is refused", () => {
    expect(authErrorKey({ code: "email_address_invalid", message: "" })).toBe("auth.errEmail");
    expect(authErrorKey({ code: "signup_disabled", message: "" })).toBe("auth.errSignupDisabled");
    // "already registered" must win over the email branch, whose message also
    // mentions an email address.
    expect(
      authErrorKey({ message: "A user with this email address has already been registered" }),
    ).toBe("auth.errEmailTaken");
  });

  test("never passes an unrecognised message through to the reader", () => {
    // The point of this module: a raw Supabase string is English-only on a
    // bilingual site, and often written for a developer rather than a user.
    expect(authErrorKey({ message: "AuthApiError: unexpected_failure (500)" })).toBe(
      "auth.errGeneric",
    );
    expect(authErrorKey({})).toBe("auth.errGeneric");
    expect(authErrorKey(null)).toBe("auth.errGeneric");
  });
});
