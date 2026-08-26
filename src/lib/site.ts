/**
 * Canonical origin for the public site. Share cards, canonical links and the
 * sitemap must all point at one host — the apex domain — no matter which
 * preview or deploy URL actually served the request.
 */
export const SITE_URL = "https://toktiang.com";

/** Default share image for pages without a cover of their own. */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.jpg`;

/**
 * Intrinsic size of the default card, in sync with `public/og-default.jpg`.
 * Declaring these lets a scraper lay the card out without fetching the image
 * first — otherwise the *first* share of a link often renders without one.
 */
const DEFAULT_OG_IMAGE_SIZE = { width: "1200", height: "630", type: "image/jpeg" } as const;

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
  const resolved = shareImage(image);
  return {
    meta: [
      { property: "og:url", content: url },
      { property: "og:image", content: resolved },
      { name: "twitter:image", content: resolved },
      // Only the default card has known dimensions. A topic cover is uploaded
      // art of arbitrary size, and stating the wrong size is worse than
      // stating none: the scraper lays out a box the image does not fill.
      ...(resolved === DEFAULT_OG_IMAGE
        ? [
            { property: "og:image:width", content: DEFAULT_OG_IMAGE_SIZE.width },
            { property: "og:image:height", content: DEFAULT_OG_IMAGE_SIZE.height },
            { property: "og:image:type", content: DEFAULT_OG_IMAGE_SIZE.type },
          ]
        : []),
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
