import { describe, it, expect } from "vitest";
import { parseTerms, matches } from "./search";

describe("parseTerms", () => {
  it("lower-cases and splits on whitespace", () => {
    expect(parseTerms("  Payment   482 ")).toEqual(["payment", "482"]);
  });

  it("returns nothing for an empty or blank query", () => {
    expect(parseTerms("")).toEqual([]);
    expect(parseTerms("   ")).toEqual([]);
  });
});

describe("matches", () => {
  it("matches everything when there is no query", () => {
    expect(matches([], "anything")).toBe(true);
  });

  it("is a case-insensitive substring test", () => {
    expect(matches(["webh"], "Retry the payment webhook")).toBe(true);
    expect(matches(["webhook"], "Retry the payment")).toBe(false);
  });

  // The point of joining the fields rather than testing them one at a time:
  // one term can land on the title while another lands on the repo.
  it("requires every term, but each may match a different field", () => {
    expect(matches(["acme", "482"], "Retry the payment webhook", "acme/api", 482)).toBe(true);
    expect(matches(["acme", "999"], "Retry the payment webhook", "acme/api", 482)).toBe(false);
  });

  it("searches a list field, so a check name is findable", () => {
    expect(matches(["integration"], "Some PR", ["build", "integration-tests"])).toBe(true);
  });

  it("ignores fields that are absent", () => {
    expect(matches(["acme"], undefined, "", "acme/api")).toBe(true);
  });
});
