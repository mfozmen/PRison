import { describe, it, expect } from "vitest";
import {
  appendEvents,
  parseActivity,
  unseenCount,
  markAllSeen,
  MAX_ENTRIES,
  type ActivityEntry,
} from "./activity";
import { statusEvent, activityEntry } from "./fixtures";

const NOW = new Date("2026-06-25T12:00:00Z");

describe("appendEvents", () => {
  it("records an event as unseen, stamped with when PRison noticed", () => {
    const log = appendEvents([], [statusEvent()], NOW);
    expect(log).toEqual([
      { ...statusEvent(), recordedAt: NOW.toISOString(), seen: false },
    ]);
  });

  it("puts the newest first, so the panel reads top-down", () => {
    const first = appendEvents([], [statusEvent({ id: "A" })], NOW);
    const second = appendEvents(first, [statusEvent({ id: "B" })], NOW);
    expect(second.map((e) => e.id)).toEqual(["B", "A"]);
  });

  it("keeps the last event of a poll at the very top", () => {
    // diffStatuses emits in list order, so the tail is the freshest news —
    // the same reason the notification spells out the tail rather than the head.
    const log = appendEvents(
      [],
      [statusEvent({ id: "A" }), statusEvent({ id: "B" }), statusEvent({ id: "C" })],
      NOW,
    );
    expect(log.map((e) => e.id)).toEqual(["C", "B", "A"]);
  });

  it("records the same PR again when it changes again", () => {
    const first = appendEvents([], [statusEvent({ status: "failing" })], NOW);
    const second = appendEvents(first, [statusEvent({ status: "ready" })], NOW);
    expect(second.map((e) => e.status)).toEqual(["ready", "failing"]);
  });

  it("returns a copy, not the same array, when there is nothing to record", () => {
    const log = [activityEntry()];
    const after = appendEvents(log, [], NOW);
    expect(after).toEqual(log);
    expect(after).not.toBe(log);
  });

  it("drops the oldest once the log is full", () => {
    const full = Array.from({ length: MAX_ENTRIES }, (_, i) =>
      activityEntry({ id: `old-${i}` }),
    );
    const log = appendEvents(full, [statusEvent({ id: "new" })], NOW);
    expect(log).toHaveLength(MAX_ENTRIES);
    expect(log[0].id).toBe("new");
    expect(log.some((e) => e.id === `old-${MAX_ENTRIES - 1}`)).toBe(false);
  });
});

describe("parseActivity", () => {
  it("reads back what was written", () => {
    const log = [activityEntry()];
    expect(parseActivity(JSON.stringify(log))).toEqual(log);
  });

  it.each([
    ["nothing stored", null],
    ["an empty string", ""],
    ["unparseable json", "{oh no"],
    ["a value that isn't an array", '{"id":"PR_1"}'],
  ])("reads %s as no history", (_label, raw) => {
    expect(parseActivity(raw)).toEqual([]);
  });

  it("drops a malformed entry but keeps the ones around it", () => {
    const raw = JSON.stringify([
      activityEntry({ id: "good" }),
      { id: "bad", repo: "acme/api" },
      activityEntry({ id: "alsoGood" }),
    ]);
    expect(parseActivity(raw).map((e) => e.id)).toEqual(["good", "alsoGood"]);
  });

  it("drops entries that aren't objects at all", () => {
    const raw = JSON.stringify([null, "PR_1", 42, activityEntry({ id: "good" })]);
    expect(parseActivity(raw).map((e) => e.id)).toEqual(["good"]);
  });

  it.each([
    ["a missing url", { url: undefined }],
    // A status from a future version, or a hand-typed one: it would otherwise
    // render a row that names a PR and then says nothing about it.
    ["a status this version doesn't know", { status: "rebasing" }],
    // `in` would accept this from Object.prototype and hand the row a function.
    ["a status borrowed from the prototype chain", { status: "constructor" }],
    ["a number where a string belongs", { repo: 7 }],
    ["seen as a string", { seen: "yes" }],
    ["a missing recordedAt", { recordedAt: undefined }],
  ])("rejects an entry with %s", (_label, broken) => {
    const raw = JSON.stringify([{ ...activityEntry(), ...broken }]);
    expect(parseActivity(raw)).toEqual([]);
  });

  it("truncates a log that grew past the cap outside the app", () => {
    const oversized = Array.from({ length: MAX_ENTRIES + 10 }, (_, i) =>
      activityEntry({ id: `e-${i}` }),
    );
    expect(parseActivity(JSON.stringify(oversized))).toHaveLength(MAX_ENTRIES);
  });
});

describe("unseenCount", () => {
  it("counts only what hasn't been read", () => {
    const log: ActivityEntry[] = [
      activityEntry({ id: "a", seen: false }),
      activityEntry({ id: "b", seen: true }),
      activityEntry({ id: "c", seen: false }),
    ];
    expect(unseenCount(log)).toBe(2);
  });

  it("is zero for an empty log", () => {
    expect(unseenCount([])).toBe(0);
  });
});

describe("markAllSeen", () => {
  it("marks every entry read", () => {
    const log = [activityEntry({ id: "a" }), activityEntry({ id: "b", seen: true })];
    expect(markAllSeen(log).every((e) => e.seen)).toBe(true);
  });

  it("hands back the same array when there was nothing unseen", () => {
    // Opening an already-read panel must not churn state or rewrite storage.
    const log = [activityEntry({ seen: true })];
    expect(markAllSeen(log)).toBe(log);
  });
});
