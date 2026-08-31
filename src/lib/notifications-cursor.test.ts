import { describe, expect, test } from "bun:test";
import { notificationsPageFilter, nextNotificationsCursor } from "./notifications-cursor";

const TS = "2026-08-26T03:17:00.123456+00:00";
const ID = "11111111-2222-3333-4444-555555555555";

describe("notificationsPageFilter", () => {
  test("is null for the first page", () => {
    expect(notificationsPageFilter(null)).toBeNull();
  });

  test("asks for strictly-older, or same-instant with a smaller id", () => {
    expect(notificationsPageFilter({ createdAt: TS, id: ID })).toBe(
      `created_at.lt.${TS},and(created_at.eq.${TS},id.lt.${ID})`,
    );
  });

  test("passes the timestamp through verbatim", () => {
    // Re-serialising through Date would truncate microseconds to
    // milliseconds and silently skip rows inside the truncated interval.
    const filter = notificationsPageFilter({ createdAt: TS, id: ID })!;
    expect(filter).toContain(".123456");
    expect(filter).not.toContain(".123+");
    expect(filter).not.toContain("Z");
  });
});

describe("nextNotificationsCursor", () => {
  const rows = (n: number, sharedTs?: string) =>
    Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      created_at: sharedTs ?? `2026-08-26T03:${String(59 - i).padStart(2, "0")}:00+00:00`,
    }));

  test("points at the last row of a full page", () => {
    expect(nextNotificationsCursor(rows(3), 3)).toEqual({
      createdAt: "2026-08-26T03:57:00+00:00",
      id: "id-2",
    });
  });

  test("is null once a page comes back short", () => {
    // The query asked for a full page and Postgres had fewer rows to give,
    // so there is nothing after this one.
    expect(nextNotificationsCursor(rows(2), 3)).toBeNull();
    expect(nextNotificationsCursor([], 3)).toBeNull();
  });

  test("carries the id so a tie at the boundary still advances", () => {
    // Every row shares an instant — exactly what the bot worker produces when
    // two planned actions land together. Without the id the next page would
    // ask for `created_at < X` and skip the rest of the tie.
    const cursor = nextNotificationsCursor(rows(3, TS), 3);
    expect(cursor).toEqual({ createdAt: TS, id: "id-2" });
    expect(notificationsPageFilter(cursor)).toContain(`id.lt.id-2`);
  });
});
