import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * The SSR document is identical for every visitor: auth state is hydrated in
 * the browser from local storage, never baked into the HTML. So the shell can
 * live on the CDN, which is what src/lib/cache.ts assumes as its first line of
 * defence. Browsers still revalidate (`max-age=0`), so a reader who votes sees
 * fresh markup on their next navigation.
 */
const DOCUMENT_CACHE_CONTROL =
  "public, max-age=0, must-revalidate, s-maxage=30, stale-while-revalidate=300";

/** Routes whose HTML is per-user or must never be served from a shared cache. */
function isPrivatePath(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_serverFn") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth")
  );
}

function withDocumentCacheHeaders(request: Request, response: Response): Response {
  if (request.method !== "GET" || response.status !== 200) return response;
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  if (response.headers.has("set-cookie")) return response;
  if (isPrivatePath(new URL(request.url).pathname)) return response;
  // Anything already opting out (a route that set its own policy) is respected.
  const existing = response.headers.get("cache-control") ?? "";
  if (existing.includes("s-maxage") || existing.includes("private")) return response;

  const headers = new Headers(response.headers);
  headers.set("cache-control", DOCUMENT_CACHE_CONTROL);
  headers.append("vary", "accept-encoding");
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withDocumentCacheHeaders(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
