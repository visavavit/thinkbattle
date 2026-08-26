/**
 * Cloudflare Web Analytics — cookieless, no consent banner required under
 * PDPA. This is deliberately the standalone beacon script rather than relying
 * on the dashboard-level "automatic install" toggle for a zone: the app is a
 * Worker, and the manual beacon works the same regardless of how the zone in
 * front of it is configured.
 *
 * Reads the token from an env var rather than hardcoding one, so this no-ops
 * until `VITE_CF_BEACON_TOKEN` is set in the deploy environment — nothing here
 * requires the token to exist for the app to build or run.
 *
 * Deliberately excluded from /admin and /auth: neither is public content, and
 * neither needs to be counted as a "visit" the way the public feed does.
 */

const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

export function WebAnalytics() {
  const token = import.meta.env["VITE_CF_BEACON_TOKEN"];
  if (!token) return null;

  return <script defer src={BEACON_SRC} data-cf-beacon={JSON.stringify({ token })} />;
}
