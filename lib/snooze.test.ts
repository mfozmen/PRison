import { describe, it, expect } from "vitest";
import { wakeTime, snoozeFor, isSnoozed, pruneSnoozes, parseSnoozes, wakeLabel } from "./snooze";

// A Wednesday afternoon, local time.
const wed = new Date(2026, 10, 18, 15, 30);

describe("wakeTime", () => {
  it("wakes at 9:00 the next morning", () => {
    const d = wakeTime("tomorrow", wed);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([19, 9, 0]);
  });

  it("wakes at 9:00 on the coming Monday, a week on from a Monday", () => {
    expect(wakeTime("monday", wed).getDay()).toBe(1);
    expect(wakeTime("monday", wed).getDate()).toBe(23);
    const mon = new Date(2026, 10, 23, 10, 0);
    expect(wakeTime("monday", mon).getDate()).toBe(30);
  });
});

describe("isSnoozed", () => {
  it("sleeps until the time comes", () => {
    const s = snoozeFor("tomorrow", "m", wed);
    expect(isSnoozed(s, "m", wed)).toBe(true);
    expect(isSnoozed(s, "m", new Date(2026, 10, 19, 9, 1))).toBe(false);
  });

  it("sleeps until the item's mark moves", () => {
    const s = snoozeFor("change", "2026-11-18T10:00:00Z", wed);
    expect(isSnoozed(s, "2026-11-18T10:00:00Z", wed)).toBe(true);
    expect(isSnoozed(s, "2026-11-19T08:00:00Z", wed)).toBe(false);
    expect(isSnoozed(undefined, "x", wed)).toBe(false);
  });
});

describe("pruneSnoozes", () => {
  it("keeps only what is still asleep on the board", () => {
    const snoozes = {
      asleep: snoozeFor("change", "a", wed),
      changed: snoozeFor("change", "b", wed),
      gone: snoozeFor("tomorrow", "c", wed),
    };
    const marks = new Map([["asleep", "a"], ["changed", "b2"]]);
    expect(Object.keys(pruneSnoozes(snoozes, marks, wed))).toEqual(["asleep"]);
  });
});

describe("parseSnoozes", () => {
  it("keeps well-formed entries and survives junk", () => {
    expect(parseSnoozes('{"a":{"kind":"change","mark":"m"},"b":{"kind":"time"},"c":3}')).toEqual({
      a: { kind: "change", mark: "m" },
    });
    expect(parseSnoozes("not json")).toEqual({});
    expect(parseSnoozes(null)).toEqual({});
  });
});

describe("wakeLabel", () => {
  it("says when it wakes", () => {
    expect(wakeLabel({ kind: "change", mark: "m" })).toBe("wakes when it changes");
    expect(wakeLabel(snoozeFor("monday", "m", wed))).toBe("wakes Mon 09:00");
  });
});
