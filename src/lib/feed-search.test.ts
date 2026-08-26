import { describe, expect, test } from "bun:test";
import { escapeLikeLiteral, feedPageFilter, nextFeedCursor, searchTerms } from "./feed-search";

describe("escapeLikeLiteral", () => {
  test("escapes the three characters ILIKE treats specially", () => {
    expect(escapeLikeLiteral("100%")).toBe("100\\%");
    expect(escapeLikeLiteral("a_b")).toBe("a\\_b");
    expect(escapeLikeLiteral("back\\slash")).toBe("back\\\\slash");
  });

  test("leaves ordinary text alone, Thai included", () => {
    expect(escapeLikeLiteral("ถกเถียง")).toBe("ถกเถียง");
    expect(escapeLikeLiteral("pineapple")).toBe("pineapple");
  });
});

describe("searchTerms", () => {
  test("is empty for a blank search", () => {
    expect(searchTerms(undefined)).toEqual([]);
    expect(searchTerms(null)).toEqual([]);
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms("   ")).toEqual([]);
  });

  test("wraps each word so every one has to land somewhere", () => {
    expect(searchTerms("thai food")).toEqual(["%thai%", "%food%"]);
  });

  test("lowercases and collapses whitespace", () => {
    expect(searchTerms("  Thai   FOOD ")).toEqual(["%thai%", "%food%"]);
  });

  test("keeps a Thai phrase as one term when it has no spaces", () => {
    // Thai is written without word breaks, which is exactly why this is a
    // trigram match and not tsvector.
    expect(searchTerms("ถกเถียง")).toEqual(["%ถกเถียง%"]);
  });

  test("caps the number of terms, so the filter count is not reader-chosen", () => {
    expect(searchTerms("a b c d e f g h i")).toHaveLength(6);
  });

  test("escapes wildcards inside the wrapping percent signs", () => {
    expect(searchTerms("50%")).toEqual(["%50\\%%"]);
  });
});

describe("feedPageFilter", () => {
  test("is null on the first page", () => {
    expect(feedPageFilter("total_votes", null)).toBeNull();
  });

  test("asks for strictly-past, or level-and-past on id", () => {
    expect(feedPageFilter("total_votes", { value: "42", id: "abc" })).toBe(
      "total_votes.lt.42,and(total_votes.eq.42,id.lt.abc)",
    );
  });

  test("uses whichever column the ordering pages on", () => {
    expect(
      feedPageFilter("published_at", { value: "2026-01-01T00:00:00+00:00", id: "x" }),
    ).toContain("published_at.lt.2026-01-01T00:00:00+00:00");
  });
});

describe("nextFeedCursor", () => {
  const rows = (n: number, votes = (i: number) => 100 - i) =>
    Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, total_votes: votes(i) }));

  test("points at the last row of a full page", () => {
    expect(nextFeedCursor(rows(3), "total_votes", 3)).toEqual({ value: "98", id: "id-2" });
  });

  test("is null once a page comes back short", () => {
    expect(nextFeedCursor(rows(2), "total_votes", 3)).toBeNull();
    expect(nextFeedCursor([], "total_votes", 3)).toBeNull();
  });

  test("still advances when the whole page ties on the sort column", () => {
    // Vote counts tie constantly — a brand new feed is every topic on zero.
    const cursor = nextFeedCursor(
      rows(3, () => 0),
      "total_votes",
      3,
    );
    expect(cursor).toEqual({ value: "0", id: "id-2" });
    expect(feedPageFilter("total_votes", cursor)).toContain("id.lt.id-2");
  });

  test("stops rather than emit a cursor on a null sort value", () => {
    const withNull = [{ id: "a", published_at: null }];
    expect(nextFeedCursor(withNull, "published_at", 1)).toBeNull();
  });
});
