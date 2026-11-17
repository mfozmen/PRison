import { describe, it, expect } from "vitest";
import { isSeen, parseSeen } from "./seen-comments";

describe("isSeen", () => {
  const seen = { t1: "2026-11-01T10:00:00Z" };

  it("holds while the thread is where it was marked", () => {
    expect(isSeen({ id: "t1", commentedAt: "2026-11-01T10:00:00Z" }, seen)).toBe(true);
  });

  // A new reply moves commentedAt — the mark must not swallow it.
  it("lets go once a newer comment lands", () => {
    expect(isSeen({ id: "t1", commentedAt: "2026-11-02T10:00:00Z" }, seen)).toBe(false);
  });

  it("is false for an unmarked thread", () => {
    expect(isSeen({ id: "t2", commentedAt: "2026-11-01T10:00:00Z" }, seen)).toBe(false);
  });
});

describe("parseSeen", () => {
  it.each([null, "not json", "[]", "null", "42"])("returns {} for %s", (raw) => {
    expect(parseSeen(raw)).toEqual({});
  });

  it("keeps string entries and drops the rest", () => {
    expect(parseSeen(JSON.stringify({ a: "x", b: 1, c: null }))).toEqual({ a: "x" });
  });
});
