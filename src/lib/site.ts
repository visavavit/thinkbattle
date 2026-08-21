/**
 * Canonical origin for the public site. Share cards, canonical links and the
 * sitemap must all point at one host — the apex domain — no matter which
 * preview or deploy URL actually served the request.
 */
export const SITE_URL = "https://toktiang.com";

/** Default share image for pages without a cover of their own. */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.jpg`;

/** Absolute URL for a site-relative path. */
export function canonical(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Only absolute https images are usable as share cards. */
export function shareImage(url?: string | null): string {
  return url && /^https:\/\//i.test(url) ? url : DEFAULT_OG_IMAGE;
}

/**
 * The meta every public page needs: canonical link plus the og:url/og:image
 * pair that turns a share into a card instead of a bare text link.
 */
export function seoTags(path: string, image?: string | null) {
  const url = canonical(path);
  return {
    meta: [
      { property: "og:url", content: url },
      { property: "og:image", content: shareImage(image) },
      { name: "twitter:image", content: shareImage(image) },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
