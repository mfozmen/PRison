import { describe, it, expect } from "vitest";
import { isValidLogin } from "./validate";

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
