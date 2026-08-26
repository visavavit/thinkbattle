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
