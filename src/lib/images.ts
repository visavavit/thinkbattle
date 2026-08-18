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

const RENDITION_PATTERN = /-w(\d+)\.(jpg|png|webp)$/;

/** The widths actually uploaded for a stored cover URL, widest last. */
export function coverWidthsFor(url: string): number[] | undefined {
  const match = RENDITION_PATTERN.exec(url);
  if (!match) return undefined;
  const largest = Number(match[1]);
  const widths = COVER_WIDTHS.filter((w) => w <= largest);
  return widths.length > 0 ? widths : undefined;
}

/**
 * A srcset for a stored cover, or undefined when the image predates the
 * rendition ladder and only exists at one size.
 */
export function coverSrcSet(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const widths = coverWidthsFor(url);
  if (!widths) return undefined;
  return widths.map((w) => `${url.replace(RENDITION_PATTERN, `-w${w}.$2`)} ${w}w`).join(", ");
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
