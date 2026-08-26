/**
 * Guest identity: a signed, HttpOnly cookie naming one device.
 *
 * What the signature actually buys, stated plainly, because it is easy to
 * overclaim: the id is server-minted and therefore genuinely random, so no
 * client can pin many devices onto one row or collide onto an id it guessed;
 * junk is rejected before it costs a database round trip; and the version
 * prefix means every guest identity can be invalidated in one deploy.
 *
 * It does NOT stop ballot stuffing. Forging a fresh uuid is exactly as easy as
 * clearing the cookie, and clearing the cookie is a menu item. Guest voting
 * trades integrity for reach; the admin switch and admin_purge_guest_votes are
 * what make that trade reversible.
 */

import { getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";

export const GUEST_COOKIE = "tt_gid";

/** Bump to invalidate every issued identity at once. */
const VERSION = "v1";

/** Chrome caps cookie lifetime at 400 days regardless of what is asked for. */
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

function secret(): string | undefined {
  return process.env["GUEST_COOKIE_SECRET"];
}

function base64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Web Crypto rather than node:crypto — this runs on Cloudflare Workers, where
 * crypto.subtle is present and the Node builtin is not reliably.
 */
async function sign(payload: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload)));
}

/** Same shape as the bot tick endpoint's check, for the same reason. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verify a cookie value and return the id it carries, or null. */
export async function readGuestId(raw: string | undefined): Promise<string | null> {
  const key = secret();
  if (!raw || !key) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [version, id, mac] = parts as [string, string, string];
  if (version !== VERSION || !UUID.test(id)) return null;
  const expected = await sign(`${version}.${id}`, key);
  return timingSafeEqual(mac, expected) ? id : null;
}

export async function mintGuestToken(id: string): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  return `${VERSION}.${id}.${await sign(`${VERSION}.${id}`, key)}`;
}

/**
 * The device's id, minting and setting one if it has none.
 *
 * Only ever call this from a POST server function. The rule the whole design
 * rests on: nothing in the SSR or document path may read or write this cookie.
 * server.ts skips document caching when Set-Cookie is present, but has no
 * protection against a response that merely *varies* by a request cookie — so
 * a loader reading this during SSR would put one device's "you voted A" into a
 * shared edge cache entry served to everyone else in that colo, silently.
 */
export async function requireGuestId(): Promise<string | null> {
  if (!secret()) return null;

  const existing = await readGuestId(getCookie(GUEST_COOKIE));
  if (existing) return existing;

  const id = crypto.randomUUID();
  const token = await mintGuestToken(id);
  if (!token) return null;

  setCookie(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: true,
    // Lax, not Strict: a reader arriving from a LINE or X link is a cross-site
    // top-level GET, and Strict would make every inbound share look like a
    // brand new device. The vote itself is a same-site POST, which Lax allows.
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return id;
}

/** Read the current id without ever issuing one. */
export async function currentGuestId(): Promise<string | null> {
  return readGuestId(getCookie(GUEST_COOKIE));
}

/** Retire the cookie once its votes belong to an account. */
export function clearGuestCookie(): void {
  setCookie(GUEST_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * A daily-rotating hash of the caller's address, for rate limiting.
 *
 * Never the raw address: the salt is the same secret used for signing plus the
 * date, so yesterday's hashes cannot be linked to today's and nothing stored
 * identifies anyone. CF-Connecting-IP is set by Cloudflare and strips any
 * client-supplied copy; the X-Forwarded-For fallback is only for other hosts.
 */
export async function requestIpHash(): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const address =
    getRequestHeader("cf-connecting-ip") ??
    (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim();
  if (!address) return null;
  const day = new Date().toISOString().slice(0, 10);
  return sign(`${address}:${day}`, key);
}
