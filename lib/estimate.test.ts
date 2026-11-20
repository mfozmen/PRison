import { describe, it, expect } from "vitest";
import { reviewMinutes, minutesLabel, sizeTone, stuckMinutes, budgetLabel } from "./estimate";

describe("reviewMinutes", () => {
  it("rounds up to a step, so it never pretends to precision", () => {
    expect(reviewMinutes({ additions: 3, deletions: 1, changedFiles: 1 })).toBe(5);
    expect(reviewMinutes({ additions: 60, deletions: 24, changedFiles: 3 })).toBe(15);
    expect(reviewMinutes({ additions: 250, deletions: 60, changedFiles: 9 })).toBe(40);
    expect(reviewMinutes({ additions: 1000, deletions: 240, changedFiles: 31 })).toBe(120);
  });

  it("says nothing when GitHub sent no size", () => {
    expect(reviewMinutes({})).toBeNull();
  });
});

describe("labels", () => {
  it("reads like an estimate", () => {
    expect(minutesLabel(10)).toBe("~10 min");
    expect(minutesLabel(60)).toBe("~1 h");
    expect(minutesLabel(90)).toBe("~1.5 h");
    expect(minutesLabel(120)).toBe("~2 h+");
    expect(budgetLabel(15)).toBe("15 min");
    expect(budgetLabel(60)).toBe("1 hour");
    expect(budgetLabel(null)).toBe("Any");
  });

  it("colours small, medium and large", () => {
    expect([sizeTone(5), sizeTone(25), sizeTone(40)]).toEqual(["success", "warning", "danger"]);
  });

  it("guesses a stuck PR by its blocker", () => {
    expect(stuckMinutes({ mergeState: "DIRTY", failingChecks: 1 })).toBe(25);
    expect(stuckMinutes({ mergeState: "BLOCKED", failingChecks: 2 })).toBe(5);
    expect(stuckMinutes({ mergeState: "BLOCKED", failingChecks: 0 })).toBe(15);
  });
});
