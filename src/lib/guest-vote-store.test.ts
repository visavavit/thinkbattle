import { describe, expect, test } from "bun:test";
import { parseGuestVotes, withGuestVote, withoutGuestVotes } from "./guest-vote-store";

describe("parseGuestVotes", () => {
  test("reads a well-formed map", () => {
    expect(parseGuestVotes('{"t1":"a","t2":"b"}')).toEqual({ t1: "a", t2: "b" });
  });

  test("is empty for nothing stored", () => {
    expect(parseGuestVotes(null)).toEqual({});
    expect(parseGuestVotes(undefined)).toEqual({});
    expect(parseGuestVotes("")).toEqual({});
  });

  test("survives corrupted storage rather than throwing", () => {
    // Anyone can edit localStorage; a bad value must not break the page.
    expect(parseGuestVotes("not json")).toEqual({});
    expect(parseGuestVotes("[1,2,3]")).toEqual({});
    expect(parseGuestVotes("null")).toEqual({});
    expect(parseGuestVotes('"a string"')).toEqual({});
  });

  test("drops entries that are not a side", () => {
    expect(parseGuestVotes('{"t1":"a","t2":"c","t3":42,"t4":null}')).toEqual({ t1: "a" });
  });
});

describe("withGuestVote", () => {
  test("records a new vote", () => {
    expect(withGuestVote({}, "t1", "a")).toEqual({ t1: "a" });
  });

  test("replaces an existing vote for the same topic", () => {
    expect(withGuestVote({ t1: "a" }, "t1", "b")).toEqual({ t1: "b" });
  });

  test("does not mutate the input", () => {
    const before = { t1: "a" as const };
    withGuestVote(before, "t2", "b");
    expect(before).toEqual({ t1: "a" });
  });

  test("caps the map, dropping the least recently voted", () => {
    let votes = {};
    for (let i = 0; i < 105; i++) votes = withGuestVote(votes, `t${i}`, "a");
    const keys = Object.keys(votes);
    expect(keys).toHaveLength(100);
    expect(keys).not.toContain("t0");
    expect(keys).toContain("t104");
  });

  test("re-voting an old topic makes it recent again", () => {
    let votes = {};
    for (let i = 0; i < 100; i++) votes = withGuestVote(votes, `t${i}`, "a");
    votes = withGuestVote(votes, "t0", "b"); // t0 was oldest
    votes = withGuestVote(votes, "fresh", "a"); // pushes one out
    const keys = Object.keys(votes);
    expect(keys).toContain("t0");
    expect(keys).not.toContain("t1");
  });
});

describe("withoutGuestVotes", () => {
  test("drops the claimed topics and keeps the rest", () => {
    expect(withoutGuestVotes({ t1: "a", t2: "b", t3: "a" }, ["t1", "t3"])).toEqual({ t2: "b" });
  });

  test("ignores ids that are not stored", () => {
    expect(withoutGuestVotes({ t1: "a" }, ["nope"])).toEqual({ t1: "a" });
  });
});
