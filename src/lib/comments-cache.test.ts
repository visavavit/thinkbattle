import { describe, expect, test } from "bun:test";
import type { InfiniteData } from "@tanstack/react-query";
import { pagesHave, removeRow, upsertRow } from "./comments-cache";

type Row = { id: string; body: string };
type Page = { rows: Row[]; next: string | null };

const cache = (...pages: Row[][]): InfiniteData<Page, string | null> => ({
  pages: pages.map((rows, i) => ({ rows, next: i === pages.length - 1 ? null : `c${i}` })),
  pageParams: pages.map((_, i) => (i === 0 ? null : `c${i - 1}`)),
});

const ids = (c: InfiniteData<Page, string | null>) => c.pages.map((p) => p.rows.map((r) => r.id));

describe("upsertRow", () => {
  test("adds an unseen row to the newest page", () => {
    const next = upsertRow(cache([{ id: "a", body: "1" }], [{ id: "b", body: "2" }]), {
      id: "new",
      body: "3",
    });
    expect(ids(next)).toEqual([["new", "a"], ["b"]]);
  });

  test("replaces an existing row in place, on whichever page holds it", () => {
    // The row is on page 2. Moving it to page 0 would make an edit or a
    // reaction reorder the thread under the reader.
    const next = upsertRow(cache([{ id: "a", body: "1" }], [{ id: "b", body: "2" }]), {
      id: "b",
      body: "edited",
    });
    expect(ids(next)).toEqual([["a"], ["b"]]);
    expect(next.pages[1]!.rows[0]!.body).toBe("edited");
  });

  test("never duplicates a row that is already loaded", () => {
    const start = cache([{ id: "a", body: "1" }], [{ id: "b", body: "2" }]);
    const next = upsertRow(start, { id: "b", body: "2" });
    expect(next.pages.flatMap((p) => p.rows).filter((r) => r.id === "b")).toHaveLength(1);
  });

  test("preserves the other fields on the page it touches", () => {
    const next = upsertRow(cache([{ id: "a", body: "1" }]), { id: "z", body: "9" });
    expect(next.pages[0]!.next).toBeNull();
    expect(next.pageParams).toEqual([null]);
  });

  test("is a no-op when nothing has loaded yet", () => {
    const empty: InfiniteData<Page, string | null> = { pages: [], pageParams: [] };
    expect(upsertRow(empty, { id: "a", body: "1" })).toBe(empty);
  });
});

describe("removeRow", () => {
  test("drops the row from the page that holds it", () => {
    const next = removeRow(
      cache(
        [{ id: "a", body: "1" }],
        [
          { id: "b", body: "2" },
          { id: "c", body: "3" },
        ],
      ),
      "b",
    );
    expect(ids(next)).toEqual([["a"], ["c"]]);
  });

  test("returns the same object when the id is not loaded", () => {
    // A changed identity would make React Query re-render for nothing.
    const start = cache([{ id: "a", body: "1" }]);
    expect(removeRow(start, "missing")).toBe(start);
  });
});

describe("pagesHave", () => {
  test("searches every page, not just the first", () => {
    const c = cache([{ id: "a", body: "1" }], [{ id: "b", body: "2" }]);
    expect(pagesHave(c, (p) => p.rows.some((r) => r.id === "b"))).toBe(true);
    expect(pagesHave(c, (p) => p.rows.some((r) => r.id === "z"))).toBe(false);
  });

  test("is false for an unloaded cache", () => {
    expect(pagesHave(undefined, () => true)).toBe(false);
  });
});
