import { describe, expect, test } from "bun:test";
import { attachmentSrcSet, coverSrcSet, coverWidthsFor, renditionKey } from "./images";

const CDN = "https://cdn.example.com";

describe("attachmentSrcSet", () => {
  test("stops below the widest rendition, so the column never loads it", () => {
    // 1600 is uploaded and is what the opened view shows, but a `sizes` hint
    // alone would not keep a 2x screen off it: 520 CSS px x 2 asks for 1040,
    // and the browser takes the smallest candidate at or above that. Leaving
    // 1600 out of the srcset is what caps the inline thumbnail at 960.
    expect(attachmentSrcSet(`${CDN}/comments/abc-w1600.webp`)).toBe(
      `${CDN}/comments/abc-w480.webp 480w, ${CDN}/comments/abc-w960.webp 960w`,
    );
  });

  test("offers every rung the upload actually wrote, and no more", () => {
    // A picture whose source was too narrow for a rung stops where the upload
    // stopped — the srcset must never name a file nobody wrote.
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

  test("ignores a suffix that is not on the ladder", () => {
    // Nothing writes a key like this today — sub-rung sources are stored
    // unsized — but an old or hand-made URL must degrade to a single src
    // rather than invent siblings around a width nobody wrote.
    expect(attachmentSrcSet(`${CDN}/comments/abc-w300.webp`)).toBeUndefined();
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
