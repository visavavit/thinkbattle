/**
 * The Supabase URL and publishable key have to reach the browser somehow.
 *
 * The normal path is Vite: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
 * are read at build time and folded into the client bundle as literals. That
 * stays the primary path — it costs nothing at runtime.
 *
 * This module is the fallback for deployments where only the unprefixed
 * server variables (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) are set. SSR
 * reads those from `process.env` and works fine; the browser bundle, built
 * without the `VITE_` names, ends up with no credentials at all and throws on
 * first use — which happens during hydration, so the whole page dies. Here the
 * server serialises the same two values into the document, and the client
 * reads them back before hydration.
 *
 * Only ever put values here that are already public. Both of these are: they
 * are shipped verbatim in the client bundle on the build-time path, and the
 * publishable key is designed to be handed to anonymous browsers. That also
 * makes the injection safe for the shared edge cache in `src/server.ts` — the
 * script is byte-identical for every visitor and carries no per-user state.
 */

export type PublicEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

/** Where the bootstrap script parks the values on `window`. */
export const PUBLIC_ENV_GLOBAL_KEY = "__TT_PUBLIC_ENV__";

/** The values the server injected into this document, if any. */
export function readInjectedPublicEnv(): PublicEnv {
  const injected = (globalThis as Record<string, unknown>)[PUBLIC_ENV_GLOBAL_KEY];
  return typeof injected === "object" && injected !== null ? (injected as PublicEnv) : {};
}

/**
 * Resolved on the server from `process.env`, on the client from whatever the
 * server already injected. Both sides must agree, or the bootstrap script
 * below renders differently during SSR and hydration.
 */
function resolvePublicEnv(): PublicEnv {
  const injected = readInjectedPublicEnv();
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const resolved: PublicEnv = {};
  const url = injected.SUPABASE_URL ?? env?.["SUPABASE_URL"];
  const key = injected.SUPABASE_PUBLISHABLE_KEY ?? env?.["SUPABASE_PUBLISHABLE_KEY"];
  if (url) resolved.SUPABASE_URL = url;
  if (key) resolved.SUPABASE_PUBLISHABLE_KEY = key;
  return resolved;
}

/**
 * A `</script>` inside a JSON string would close the inline script element and
 * let the rest of the value be parsed as markup. `<!--` starts an HTML comment
 * that swallows the assignment. Neither can occur in a Supabase URL or key,
 * but the escape is what makes that a fact about this function rather than an
 * assumption about the values.
 */
function escapeForInlineScript(json: string): string {
  return json.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "\\u003C!--");
}

/**
 * Body of the inline script that hands the public env to the browser. Empty
 * when there is nothing to hand over, in which case the build-time values are
 * all the client gets — the same situation as before this existed.
 */
export function publicEnvBootstrapScript(): string {
  const env = resolvePublicEnv();
  if (!env.SUPABASE_URL && !env.SUPABASE_PUBLISHABLE_KEY) return "";
  return `window.${PUBLIC_ENV_GLOBAL_KEY}=${escapeForInlineScript(JSON.stringify(env))}`;
}
