/**
 * Responsive cover images.
 *
 * Covers are the heaviest thing the feed ships, and most readers are on phones
 * — sending a desktop-width JPEG to a 390pt screen wastes the majority of those
 * bytes. Uploads are therefore stored as a small ladder of widths, and the
 * markup hands the browser a srcset so it picks one that fits.
 *
 * The available widths are derivable from the URL alone, with no extra column
 * to store or migrate: a rendition set is written to sibling keys ending in
 * `-w<width>.<ext>`, and the URL kept on the topic is the widest of them. So
 * the suffix on a stored URL tells us exactly which smaller siblings exist.
 * Images uploaded before this (plain `<uuid>.<ext>`) match nothing and are
 * served as a single unadorned src, which is why the helpers below all
 * degrade to `undefined` rather than guessing.
 */

/** Widths a cover is rendered at, ascending. */
export const COVER_WIDTHS = [480, 960, 1600] as const;

/**
 * The cover slot is full-bleed on phones and capped by the feed grid above it,
 * so a viewport-width hint is accurate enough for the browser to choose well.
 */
export const COVER_SIZES = "(min-width: 1024px) 560px, (min-width: 640px) 50vw, 100vw";

/**
 * Widths a comment attachment is rendered at, ascending.
 *
 * The first two rungs are what the debate column actually paints: it caps at
 * roughly 520 CSS pixels, so 960 already covers a 2x phone. 1600 exists purely
 * for the tap-to-open view — an attachment on this site is usually a
 * screenshot, and a screenshot is mostly text, which is the one kind of
 * picture that is worthless at column width. Without a rung above what the
 * column paints, "see it full size" would just mean "see the same 960px file
 * on a bigger canvas".
 */
export const COMMENT_WIDTHS = [480, 960, 1600] as const;

/**
 * The rungs the *inline* thumbnail is allowed to choose from.
 *
 * This is not the same list as COMMENT_WIDTHS and must not become it. A `sizes`
 * hint alone does not keep the browser off the top rung: it multiplies the CSS
 * width by the device pixel ratio and picks the smallest candidate at or above
 * the result, so a 520px slot on an ordinary 2x laptop asks for 1040px and
 * would take the 1600 file every time. Every reader scrolling past a thread
 * would pay for the opened view nobody opened.
 *
 * Withholding 1600 from the srcset caps that at 960. The opened view does not
 * use a srcset at all — it loads the stored URL, which is the widest rendition.
 */
const COMMENT_INLINE_WIDTHS = [480, 960] as const;

/**
 * An attachment is full-bleed inside its column, and below lg only one column
 * is on screen at a time.
 */
export const COMMENT_SIZES = "(min-width: 1024px) 520px, (min-width: 640px) 50vw, 100vw";

const RENDITION_PATTERN = /-w(\d+)\.(jpg|png|webp)$/;

/** The widths actually uploaded for a stored URL on `ladder`, widest last. */
function widthsFor(url: string, ladder: readonly number[]): number[] | undefined {
  const match = RENDITION_PATTERN.exec(url);
  if (!match) return undefined;
  const largest = Number(match[1]);
  const widths = ladder.filter((w) => w <= largest);
  return widths.length > 0 ? widths : undefined;
}

/**
 * A srcset for a stored image, or undefined when it predates the rendition
 * ladder — or was uploaded unsized — and only exists at one size.
 */
function srcSetFor(url: string | null | undefined, ladder: readonly number[]): string | undefined {
  if (!url) return undefined;
  const widths = widthsFor(url, ladder);
  if (!widths) return undefined;
  return widths.map((w) => `${url.replace(RENDITION_PATTERN, `-w${w}.$2`)} ${w}w`).join(", ");
}

/** The widths actually uploaded for a stored cover URL, widest last. */
export function coverWidthsFor(url: string): number[] | undefined {
  return widthsFor(url, COVER_WIDTHS);
}

/** A srcset for a stored cover. */
export function coverSrcSet(url: string | null | undefined): string | undefined {
  return srcSetFor(url, COVER_WIDTHS);
}

/**
 * A srcset for a take's attachment as it appears inline in a column. Tops out
 * below the widest stored rendition on purpose — see COMMENT_INLINE_WIDTHS.
 */
export function attachmentSrcSet(url: string | null | undefined): string | undefined {
  return srcSetFor(url, COMMENT_INLINE_WIDTHS);
}

/** Builds the object key for one rendition of an upload. */
export function renditionKey(
  folder: string,
  id: string,
  ext: string,
  width?: number | undefined,
): string {
  return `${folder}/${id}${width ? `-w${width}` : ""}.${ext}`;
}
