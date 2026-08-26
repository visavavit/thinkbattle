import { describe, expect, test } from "bun:test";
import { safeReturnPath } from "./return-to";

describe("safeReturnPath", () => {
  test("accepts same-origin paths", () => {
    expect(safeReturnPath("/")).toBe("/");
    expect(safeReturnPath("/browse")).toBe("/browse");
    expect(safeReturnPath("/topic/abc-123")).toBe("/topic/abc-123");
    expect(safeReturnPath("/browse?sort=top&category=tech")).toBe("/browse?sort=top&category=tech");
    expect(safeReturnPath("/topic/abc#comment-9")).toBe("/topic/abc#comment-9");
  });

  test("keeps Thai characters in the query intact", () => {
    expect(safeReturnPath("/browse?q=ถกเถียง")).toBe("/browse?q=ถกเถียง");
  });

  // The whole point of this function. Each of these, if allowed through, is a
  // phishing link that starts on the real site and lands somewhere else.
  test("rejects absolute URLs", () => {
    expect(safeReturnPath("https://evil.example")).toBeUndefined();
    expect(safeReturnPath("http://evil.example/x")).toBeUndefined();
    expect(safeReturnPath("javascript:alert(1)")).toBeUndefined();
    expect(safeReturnPath("data:text/html,x")).toBeUndefined();
  });

  test("rejects scheme-relative URLs, which resolve to another origin", () => {
    expect(safeReturnPath("//evil.example")).toBeUndefined();
    expect(safeReturnPath("//evil.example/path")).toBeUndefined();
  });

  test("rejects the backslash variants some parsers normalise", () => {
    expect(safeReturnPath("/\\evil.example")).toBeUndefined();
    expect(safeReturnPath("/\\/evil.example")).toBeUndefined();
  });

  test("rejects embedded control characters rather than stripping them", () => {
    expect(safeReturnPath("/\u0000/evil")).toBeUndefined();
    expect(safeReturnPath("/\nhttps://evil.example")).toBeUndefined();
    expect(safeReturnPath("/\rfoo")).toBeUndefined();
    expect(safeReturnPath("/\u007ffoo")).toBeUndefined();
    // A tab between the slashes is how "/ /evil" sneaks past naive checks.
    expect(safeReturnPath("/\t/evil.example")).toBeUndefined();
  });

  test("rejects relative paths that do not start with a slash", () => {
    expect(safeReturnPath("browse")).toBeUndefined();
    expect(safeReturnPath("../admin")).toBeUndefined();
  });

  test("refuses to bounce back to the auth page", () => {
    expect(safeReturnPath("/auth")).toBeUndefined();
    expect(safeReturnPath("/auth?redirect=/browse")).toBeUndefined();
    // but a path that merely starts with the same letters is fine
    expect(safeReturnPath("/authors")).toBe("/authors");
  });

  test("rejects non-strings and empties", () => {
    expect(safeReturnPath(undefined)).toBeUndefined();
    expect(safeReturnPath(null)).toBeUndefined();
    expect(safeReturnPath(42)).toBeUndefined();
    expect(safeReturnPath({})).toBeUndefined();
    expect(safeReturnPath("")).toBeUndefined();
    expect(safeReturnPath("   ")).toBeUndefined();
  });

  test("rejects an absurdly long path", () => {
    expect(safeReturnPath("/" + "a".repeat(4000))).toBeUndefined();
  });

  test("trims surrounding whitespace before deciding", () => {
    expect(safeReturnPath("  /browse  ")).toBe("/browse");
    expect(safeReturnPath("  //evil.example  ")).toBeUndefined();
  });
});
