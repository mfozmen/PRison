import { describe, it, expect } from "vitest";
import { resolveTracked, awaitingChecks, parseTracked, EMPTY_TRACKED } from "./tracked-checks";

describe("resolveTracked", () => {
  const cfg = {
    orgs: { acme: ["build", "test"] },
    repos: { "acme/frontend": ["ci/lint", "ci/test"] },
  };

  it("repo override beats org default", () => {
    expect(resolveTracked("acme/frontend", cfg)).toEqual(["ci/lint", "ci/test"]);
  });

  it("org default applies when no repo key", () => {
    expect(resolveTracked("acme/backend", cfg)).toEqual(["build", "test"]);
  });

  it("returns [] when neither configured", () => {
    expect(resolveTracked("other/repo", cfg)).toEqual([]);
  });
});

describe("awaitingChecks", () => {
  const cfg = {
    orgs: {},
    repos: { "acme/app": ["build", "test", "deploy", "test"] }, // duplicate "test"
  };

  it("check present in checkNames is filtered out", () => {
    expect(awaitingChecks("acme/app", ["build"], cfg)).not.toContain("build");
  });

  it("check absent appears in result", () => {
    expect(awaitingChecks("acme/app", ["build"], cfg)).toContain("test");
  });

  it("empty tracked (no config for repo) returns []", () => {
    expect(awaitingChecks("other/repo", ["build"], cfg)).toEqual([]);
  });

  it("dedup: tracked list has duplicate entry for 'test' → appears once", () => {
    const result = awaitingChecks("acme/app", [], cfg);
    const testCount = result.filter((n) => n === "test").length;
    expect(testCount).toBe(1);
  });

  it("case-sensitive: 'Build' does not match 'build', so 'build' still appears", () => {
    expect(awaitingChecks("acme/app", ["Build"], cfg)).toContain("build");
  });
});

describe("parseTracked", () => {
  it("null input returns EMPTY_TRACKED", () => {
    expect(parseTracked(null)).toEqual(EMPTY_TRACKED);
  });

  it("invalid JSON string returns EMPTY_TRACKED", () => {
    expect(parseTracked("{not valid json")).toEqual(EMPTY_TRACKED);
  });

  it("non-object (array '[]') returns EMPTY_TRACKED", () => {
    expect(parseTracked("[]")).toEqual(EMPTY_TRACKED);
  });

  it("non-object (number '42') returns EMPTY_TRACKED", () => {
    expect(parseTracked("42")).toEqual(EMPTY_TRACKED);
  });

  it("valid JSON with only orgs key coerces repos to {}", () => {
    const result = parseTracked(JSON.stringify({ orgs: { acme: ["build"] } }));
    expect(result.orgs).toEqual({ acme: ["build"] });
    expect(result.repos).toEqual({});
  });

  it("valid JSON with both keys is returned as-is", () => {
    const input = { orgs: { acme: ["build"] }, repos: { "acme/app": ["lint"] } };
    expect(parseTracked(JSON.stringify(input))).toEqual(input);
  });

  it("extra keys are silently ignored — only orgs and repos are extracted", () => {
    const result = parseTracked(JSON.stringify({ orgs: {}, repos: {}, extra: "ignored" }));
    expect(result).toEqual({ orgs: {}, repos: {} });
    expect(Object.prototype.hasOwnProperty.call(result, "extra")).toBe(false);
  });
});
