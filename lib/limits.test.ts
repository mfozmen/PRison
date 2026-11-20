import { describe, it, expect } from "vitest";
import { limitState, limitLabel, parseLimits } from "./limits";

const now = new Date("2026-11-20T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe("limitState", () => {
  it("is nothing while no limit is set", () => {
    expect(limitState(ago(100), undefined, now)).toBeNull();
    expect(limitState(ago(100), 0, now)).toBeNull();
  });

  it("fills toward the limit quietly, warns from three quarters, says how late after", () => {
    expect(limitState(ago(5), 24, now)).toEqual({ pct: (5 / 24) * 100, state: "ok", label: null });
    expect(limitState(ago(18), 24, now)).toEqual({ pct: 75, state: "due", label: "Due in 6h" });
    expect(limitState(ago(48), 24, now)).toEqual({ pct: 100, state: "late", label: "Late · 1d over" });
    expect(limitState(ago(24), 8, now)?.label).toBe("Late · 16h over");
  });
});

describe("limitLabel", () => {
  it("names each choice", () => {
    expect([0, 4, 24, 48, 168].map(limitLabel)).toEqual(["Off", "4h", "1 day", "2 days", "1 week"]);
  });
});

describe("parseLimits", () => {
  it("keeps only offered choices for known queues", () => {
    expect(parseLimits('{"review":24,"reply":5,"stuck":0,"nope":8,"others":48}')).toEqual({ review: 24, others: 48 });
    expect(parseLimits("junk")).toEqual({});
  });
});
