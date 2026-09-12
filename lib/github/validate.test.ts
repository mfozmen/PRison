import { describe, it, expect } from "vitest";
import { isValidLogin, isValidRepo } from "./validate";

describe("isValidLogin", () => {
  it.each([
    ["acme", true],
    ["my-org", true],
    ["a", true],
    ["A1", true],
    ["org-with-hyphen", true],
    ["a".repeat(39), true],
  ])("returns true for valid login %s", (login, expected) => {
    expect(isValidLogin(login)).toBe(expected);
  });

  it.each([
    ["", false, "empty string"],
    ["-acme", false, "leading hyphen"],
    ["acme-", false, "trailing hyphen"],
    ["-", false, "only hyphen"],
    ["a".repeat(40), false, "40 chars (over limit)"],
    ["acme org", false, "space in value"],
    ["acme/repo", false, "slash in value"],
    ["acme repo:x/y", false, "search qualifier injection"],
    ["acme\norg", false, "newline in value"],
    ["acme+org", false, "plus sign"],
  ])("returns false for invalid login %s (%s)", (login, expected) => {
    expect(isValidLogin(login)).toBe(expected);
  });
});

describe("isValidRepo", () => {
  it("accepts owner/name", () => {
    expect(isValidRepo("acme/api")).toBe(true);
  });

  // The reason this is not two isValidLogin calls: dots and underscores are
  // legal in a repository name and illegal in a login.
  it("accepts the punctuation a repo name allows and a login does not", () => {
    expect(isValidRepo("acme/api.js")).toBe(true);
    expect(isValidRepo("acme/api_v2")).toBe(true);
    expect(isValidRepo("acme/-api")).toBe(true);
  });

  it("rejects anything that is not exactly two halves", () => {
    expect(isValidRepo("acme")).toBe(false);
    expect(isValidRepo("acme/api/extra")).toBe(false);
    expect(isValidRepo("/api")).toBe(false);
    expect(isValidRepo("acme/")).toBe(false);
  });

  it("rejects an owner that is not a login", () => {
    expect(isValidRepo("-acme/api")).toBe(false);
    expect(isValidRepo("ac me/api")).toBe(false);
    expect(isValidRepo("acme.co/api")).toBe(false);
  });

  it("rejects a name that only walks the path", () => {
    expect(isValidRepo("acme/.")).toBe(false);
    expect(isValidRepo("acme/..")).toBe(false);
  });

  it("rejects a name past the length cap", () => {
    expect(isValidRepo(`acme/${"a".repeat(100)}`)).toBe(true);
    expect(isValidRepo(`acme/${"a".repeat(101)}`)).toBe(false);
  });
});
