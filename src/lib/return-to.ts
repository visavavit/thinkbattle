/**
 * Where to send someone after they sign in.
 *
 * The funnel this exists for: a reader on a topic page clicks "sign in to
 * vote", and without this they land on the homepage having lost the debate
 * they came to argue about.
 *
 * Everything here treats the destination as untrusted. It arrives in a query
 * string, so anyone can put anything in it, and a naive implementation is an
 * open redirect — a phishing link that genuinely starts on toktiang.com and
 * bounces to an attacker's page carrying the site's credibility with it.
 */

const STASH_KEY = "toktiang.returnTo";

/**
 * Control characters and DEL, which some parsers strip rather than reject.
 * no-control-regex exists to catch these appearing by accident; here they are
 * the entire subject of the check.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Narrow an untrusted value to a same-origin path, or nothing.
 *
 * Accepts only a path beginning with a single "/". That rejects absolute URLs
 * ("https://evil.example"), scheme-relative URLs ("//evil.example", which a
 * browser resolves to another origin), and the backslash variants some parsers
 * normalise into them ("/\\evil.example"). Control characters are refused
 * outright rather than stripped, since stripping is how a blocked payload
 * becomes an allowed one.
 */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.trim();
  if (path.length === 0 || path.length > 2048) return undefined;
  if (!path.startsWith("/")) return undefined;
  if (path.startsWith("//") || path.startsWith("/\\")) return undefined;
  if (CONTROL_CHARS.test(path)) return undefined;
  // Never bounce back to the auth page itself — that is a loop.
  if (path === "/auth" || path.startsWith("/auth?")) return undefined;
  return path;
}

/** The current location as a return target, for a link into `/auth`. */
export function currentReturnPath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return safeReturnPath(window.location.pathname + window.location.search + window.location.hash);
}

/**
 * OAuth is a full page redirect, so component state does not survive it, and
 * the return path cannot ride along in `redirect_uri`: that URI is matched
 * against Supabase's auth redirect allow-list, a dashboard-configured setting
 * (see CLAUDE.md item 10). Changing its shape risks breaking sign-in in
 * production, so the path waits here instead and is read back on return.
 */
export function stashReturnPath(path: string | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (path) window.sessionStorage.setItem(STASH_KEY, path);
    else window.sessionStorage.removeItem(STASH_KEY);
  } catch {
    // Private mode, or storage disabled. Losing the destination is a worse
    // landing page, not a broken sign-in.
  }
}

/** Read and clear a stashed path. Re-validated: storage is not trusted either. */
export function takeStashedReturnPath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    window.sessionStorage.removeItem(STASH_KEY);
    return safeReturnPath(raw);
  } catch {
    return undefined;
  }
}
