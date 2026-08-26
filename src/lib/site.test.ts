import { describe, expect, test } from "bun:test";
import { canonical, DEFAULT_OG_IMAGE, seoTags, shareImage, shareUrls } from "./site";

describe("canonical", () => {
  test("joins the apex domain to a path", () => {
    expect(canonical("/topic/abc")).toBe("https://toktiang.com/topic/abc");
  });

  test("adds the leading slash if missing", () => {
    expect(canonical("topic/abc")).toBe("https://toktiang.com/topic/abc");
  });

  test("defaults to the homepage", () => {
    expect(canonical()).toBe("https://toktiang.com/");
  });
});

describe("shareImage", () => {
  test("passes through an absolute https URL", () => {
    expect(shareImage("https://cdn.example/cover.jpg")).toBe("https://cdn.example/cover.jpg");
  });

  test("falls back to the default card for anything else", () => {
    expect(shareImage(null)).toBe(DEFAULT_OG_IMAGE);
    expect(shareImage(undefined)).toBe(DEFAULT_OG_IMAGE);
    expect(shareImage("")).toBe(DEFAULT_OG_IMAGE);
    // Not absolute https — a relative path or a bare http URL is not usable
    // as an og:image by every scraper.
    expect(shareImage("/covers/x.jpg")).toBe(DEFAULT_OG_IMAGE);
    expect(shareImage("http://cdn.example/cover.jpg")).toBe(DEFAULT_OG_IMAGE);
  });
});

describe("seoTags", () => {
  test("declares dimensions only for the default card", () => {
    const seo = seoTags("/topic/abc", null);
    const props = seo.meta.map((m) => ("property" in m ? m.property : undefined));
    expect(props).toContain("og:image:width");
    expect(props).toContain("og:image:height");
    expect(props).toContain("og:image:type");
  });

  test("omits dimensions for an arbitrary topic cover", () => {
    const seo = seoTags("/topic/abc", "https://cdn.example/cover.jpg");
    const props = seo.meta.map((m) => ("property" in m ? m.property : undefined));
    expect(props).not.toContain("og:image:width");
  });
});

describe("shareUrls", () => {
  const urls = shareUrls("https://toktiang.com/topic/abc", "หมาชนะ 54% — 1,203 votes");

  test("every intent carries the same canonical url", () => {
    const encoded = encodeURIComponent("https://toktiang.com/topic/abc");
    expect(urls.line).toContain(encoded);
    expect(urls.x).toContain(encoded);
    expect(urls.facebook).toContain(encoded);
  });

  test("carries Thai text through encoding intact", () => {
    const decoded = decodeURIComponent(urls.line.split("?")[1]!.split("%0A")[0]!);
    expect(decoded).toBe("หมาชนะ 54% — 1,203 votes");
  });

  test("never appends UTM parameters", () => {
    expect(urls.line).not.toContain("utm_");
    expect(urls.x).not.toContain("utm_");
    expect(urls.facebook).not.toContain("utm_");
  });
});
