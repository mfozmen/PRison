import { describe, it, expect } from "vitest";
import { ageBucket, sortByAgeAsc, sortByAgeDesc, relativeAge } from "./prioritize";

const now = new Date("2026-06-26T12:00:00Z");

describe("ageBucket", () => {
  it("is fresh under 1 day", () => {
    expect(ageBucket("2026-06-26T00:00:00Z", now)).toBe("fresh");
  });
  it("is warning between 1 and 3 days", () => {
    expect(ageBucket("2026-06-24T12:00:00Z", now)).toBe("warning");
  });
  it("is urgent over 3 days", () => {
    expect(ageBucket("2026-06-20T00:00:00Z", now)).toBe("urgent");
  });
});

describe("sortByAgeAsc", () => {
  it("puts the oldest timestamp first", () => {
    const items = [{ t: "2026-06-25T00:00:00Z" }, { t: "2026-06-20T00:00:00Z" }];
    const sorted = sortByAgeAsc(items, (i) => i.t);
    expect(sorted.map((i) => i.t)).toEqual([
      "2026-06-20T00:00:00Z",
      "2026-06-25T00:00:00Z",
    ]);
  });
  it("does not mutate input", () => {
    const items = [{ t: "2026-06-25T00:00:00Z" }, { t: "2026-06-20T00:00:00Z" }];
    sortByAgeAsc(items, (i) => i.t);
    expect(items[0].t).toBe("2026-06-25T00:00:00Z");
  });
});

describe("sortByAgeDesc", () => {
  it("puts the newest timestamp first", () => {
    const items = [{ t: "2026-06-20T00:00:00Z" }, { t: "2026-06-25T00:00:00Z" }];
    const sorted = sortByAgeDesc(items, (i) => i.t);
    expect(sorted.map((i) => i.t)).toEqual([
      "2026-06-25T00:00:00Z",
      "2026-06-20T00:00:00Z",
    ]);
  });
  it("does not mutate input", () => {
    const items = [{ t: "2026-06-20T00:00:00Z" }, { t: "2026-06-25T00:00:00Z" }];
    sortByAgeDesc(items, (i) => i.t);
    expect(items[0].t).toBe("2026-06-20T00:00:00Z");
  });
});

describe("relativeAge", () => {
  it("reports minutes under an hour", () => {
    expect(relativeAge("2026-06-26T11:20:00Z", now)).toBe("40m");
  });
  it("reports hours under a day", () => {
    expect(relativeAge("2026-06-26T09:00:00Z", now)).toBe("3h");
  });
  it("reports days beyond 24 hours", () => {
    expect(relativeAge("2026-06-24T12:00:00Z", now)).toBe("2d");
  });
});
