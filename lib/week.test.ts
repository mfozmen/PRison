import { describe, it, expect } from "vitest";
import { summarize, waitShort, type ReviewFact } from "./week";

const now = new Date("2026-11-20T12:00:00Z");
const H = 3_600_000;
const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * H).toISOString();
const fact = (id: string, hoursAgo: number, waitedH: number | null): ReviewFact => ({
  prId: id, title: `pr ${id}`, url: "u", repo: "acme/api", number: 1, author: "alice",
  submittedAt: at(hoursAgo), waitedMs: waitedH === null ? null : waitedH * H,
});

describe("summarize", () => {
  const facts = [
    fact("a", 2, 3),     // this week
    fact("a", 30, 9),    // this week, same PR
    fact("b", 100, 48),  // this week, the longest
    fact("c", 150, null),// this week, no request to date it from
    fact("d", 200, 1),   // last week
  ];

  it("counts this week's reviews and PRs, the median wait and the longest", () => {
    const w = summarize(facts, now);
    expect(w.reviews).toBe(4);
    expect(w.prs).toBe(3);
    expect(w.medianWaitMs).toBe(9 * H);
    expect(w.longest?.prId).toBe("b");
    expect(w.perDay.reduce((a, b) => a + b, 0)).toBe(4);
    expect(w.perDay[6]).toBe(1);
    expect(w.dayLabels).toHaveLength(7);
  });

  it("looks at the week before with an offset", () => {
    const last = summarize(facts, now, 1);
    expect(last.reviews).toBe(1);
    expect(last.longest?.prId).toBe("d");
  });

  it("is empty without reviews", () => {
    expect(summarize([], now)).toMatchObject({ reviews: 0, prs: 0, medianWaitMs: null, longest: null });
  });
});

describe("waitShort", () => {
  it("is compact", () => {
    expect([waitShort(40 * 60_000), waitShort(5 * H), waitShort(50 * H)]).toEqual(["40m", "5h", "2d"]);
  });
});
