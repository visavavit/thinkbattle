import { describe, expect, test } from "bun:test";
import { attachmentSrcSet, coverSrcSet, coverWidthsFor, renditionKey } from "./images";

const CDN = "https://cdn.example.com";

describe("attachmentSrcSet", () => {
  test("offers every rung the upload actually wrote, and no more", () => {
    expect(attachmentSrcSet(`${CDN}/comments/abc-w960.webp`)).toBe(
      `${CDN}/comments/abc-w480.webp 480w, ${CDN}/comments/abc-w960.webp 960w`,
    );
    expect(attachmentSrcSet(`${CDN}/comments/abc-w480.webp`)).toBe(
      `${CDN}/comments/abc-w480.webp 480w`,
    );
  });

  test("has none for a picture stored unsized", () => {
    // A source narrower than the first rung is written with no -w suffix, so
    // there are no siblings to point at and the markup falls back to `src`.
    expect(attachmentSrcSet(`${CDN}/comments/abc.webp`)).toBeUndefined();
  });

  test("has none for a missing url", () => {
    expect(attachmentSrcSet(null)).toBeUndefined();
    expect(attachmentSrcSet(undefined)).toBeUndefined();
  });

  test("never claims a width above the attachment ladder", () => {
    // Covers go up to 1600 and attachments stop at 960. A URL carrying a
    // cover-sized suffix must not make the attachment markup ask for a file
    // the attachment ladder never wrote.
    expect(attachmentSrcSet(`${CDN}/comments/abc-w1600.webp`)).toBe(
      `${CDN}/comments/abc-w480.webp 480w, ${CDN}/comments/abc-w960.webp 960w`,
    );
  });
});

describe("coverSrcSet", () => {
  test("still walks the wider cover ladder", () => {
    expect(coverSrcSet(`${CDN}/covers/abc-w1600.jpg`)).toBe(
      `${CDN}/covers/abc-w480.jpg 480w, ${CDN}/covers/abc-w960.jpg 960w, ${CDN}/covers/abc-w1600.jpg 1600w`,
    );
    expect(coverWidthsFor(`${CDN}/covers/abc-w960.jpg`)).toEqual([480, 960]);
    expect(coverSrcSet(`${CDN}/covers/legacy.jpg`)).toBeUndefined();
  });
});

describe("renditionKey", () => {
  test("puts a rendition on a sibling key of the unsized one", () => {
    expect(renditionKey("comments", "abc", "webp", 480)).toBe("comments/abc-w480.webp");
    expect(renditionKey("comments", "abc", "webp")).toBe("comments/abc.webp");
  });
});
