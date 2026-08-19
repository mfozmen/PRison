import { describe, it, expect } from "vitest";
import {
  resolveIgnored,
  isIgnoredCheck,
  ignoreCheck,
  unignoreCheck,
  parseIgnored,
  EMPTY_IGNORED,
  readyDespiteIgnored,
  readyFromStuck,
} from "./ignored-checks";
import { stuckPr } from "./fixtures";
import type { StuckPr } from "./types";

describe("resolveIgnored", () => {
  // Ignoring is additive, not an override: a check the whole org has given up
  // on stays given up on when a repo names one of its own. Tracked checks work
  // the other way round because there the repo list is an answer to "which
  // checks does THIS repo gate on" — a blocklist has no such question.
  const cfg = {
    orgs: { acme: ["nightly-e2e"] },
    repos: { "acme/api": ["flaky-integration"] },
  };

  it("unions the owner's list with the repo's own", () => {
    expect(resolveIgnored("acme/api", cfg)).toEqual(["nightly-e2e", "flaky-integration"]);
  });

  it("applies the owner's list to a repo that named nothing", () => {
    expect(resolveIgnored("acme/web", cfg)).toEqual(["nightly-e2e"]);
  });

  it("names a check once even when both scopes list it", () => {
    const both = { orgs: { acme: ["flaky"] }, repos: { "acme/api": ["flaky"] } };
    expect(resolveIgnored("acme/api", both)).toEqual(["flaky"]);
  });

  it("returns [] for a repo neither scope mentions", () => {
    expect(resolveIgnored("globex/api", cfg)).toEqual([]);
  });

  it("drops what a hand-edited config left unusable", () => {
    const junk = { orgs: {}, repos: { "acme/api": [5, null, "", "build"] } };
    expect(resolveIgnored("acme/api", junk as never)).toEqual(["build"]);
  });
});

describe("isIgnoredCheck", () => {
  const cfg = { orgs: { acme: ["nightly-e2e"] }, repos: {} };

  it("is true for a name the owner ignores", () => {
    expect(isIgnoredCheck("acme/api", "nightly-e2e", cfg)).toBe(true);
  });

  it("is false for a name nobody ignored", () => {
    expect(isIgnoredCheck("acme/api", "build", cfg)).toBe(false);
  });
});

describe("ignoreCheck", () => {
  it("adds the name under the repo it was ignored on, leaving other repos alone", () => {
    const next = ignoreCheck("acme/api", "flaky", { orgs: {}, repos: { "acme/web": ["other"] } });
    expect(next).toEqual({ orgs: {}, repos: { "acme/web": ["other"], "acme/api": ["flaky"] } });
  });

  it("keeps the names already ignored on that repo", () => {
    const next = ignoreCheck("acme/api", "flaky", { orgs: {}, repos: { "acme/api": ["old"] } });
    expect(next.repos["acme/api"]).toEqual(["old", "flaky"]);
  });

  // Ignoring twice is one click away from happening — the menu is on the chip,
  // and a chip is drawn per PR.
  it("does not name the same check twice", () => {
    const next = ignoreCheck("acme/api", "flaky", { orgs: {}, repos: { "acme/api": ["flaky"] } });
    expect(next.repos["acme/api"]).toEqual(["flaky"]);
  });
});

describe("unignoreCheck", () => {
  it("takes the name off the repo's list", () => {
    const next = unignoreCheck("acme/api", "flaky", {
      orgs: {},
      repos: { "acme/api": ["flaky", "other"] },
    });
    expect(next.repos["acme/api"]).toEqual(["other"]);
  });

  // The chip says "ignored" whichever scope put it there, so the menu item that
  // undoes it has to reach both — otherwise it looks like it did nothing.
  it("takes it off the owner's list too", () => {
    const next = unignoreCheck("acme/api", "nightly", { orgs: { acme: ["nightly"] }, repos: {} });
    expect(resolveIgnored("acme/api", next)).toEqual([]);
  });

  it("drops a scope's key once its last name goes, rather than leaving []", () => {
    const next = unignoreCheck("acme/api", "flaky", { orgs: {}, repos: { "acme/api": ["flaky"] } });
    expect(next.repos).toEqual({});
  });
});

describe("parseIgnored", () => {
  it("returns the empty config for nothing stored", () => {
    expect(parseIgnored(null)).toEqual(EMPTY_IGNORED);
  });

  it("returns the empty config for unparseable JSON", () => {
    expect(parseIgnored("{oops")).toEqual(EMPTY_IGNORED);
  });

  it("returns the empty config for JSON that is not an object", () => {
    expect(parseIgnored("[1,2]")).toEqual(EMPTY_IGNORED);
  });

  it("keeps both scopes and coerces a missing one", () => {
    expect(parseIgnored(JSON.stringify({ repos: { "acme/api": ["flaky"] } }))).toEqual({
      orgs: {},
      repos: { "acme/api": ["flaky"] },
    });
  });
});

describe("readyDespiteIgnored", () => {
  const s = (over: Partial<StuckPr> = {}): StuckPr =>
    stuckPr({ repo: "acme/api", url: "u", stuckSince: "x", ...over });
  const cfg = { orgs: {}, repos: { "acme/api": ["flaky"] } };

  it("is true when the only red check is one the user ignores", () => {
    expect(readyDespiteIgnored(s({ failing: ["flaky"], failingChecks: 1 }), cfg)).toBe(true);
  });

  it("is false while a check they still care about is red", () => {
    expect(readyDespiteIgnored(s({ failing: ["flaky", "build"], failingChecks: 2 }), cfg)).toBe(false);
  });

  it("is false while a check is still running", () => {
    expect(readyDespiteIgnored(s({ failing: ["flaky"], pending: ["build"] }), cfg)).toBe(false);
  });

  // Nothing to forgive: this PR was never held by a check, so promoting it here
  // would mean guessing at the reason it is in the stuck list.
  it("is false for a PR with no check against it at all", () => {
    expect(readyDespiteIgnored(s({}), cfg)).toBe(false);
  });

  // A conflict and a review gate outlive any check result, and GitHub itself
  // refuses the merge while a required check is red — so BLOCKED stays blocked.
  // Ignoring a check says "this result does not mean anything to me", never
  // "merge it anyway".
  it.each([
    ["a merge conflict", { mergeState: "DIRTY" }],
    ["a review that was asked for", { reviewDecision: "REVIEW_REQUIRED" }],
    ["changes that were requested", { reviewDecision: "CHANGES_REQUESTED" }],
  ])("is false while %s holds the PR", (_label, over) => {
    expect(readyDespiteIgnored(s({ failing: ["flaky"], ...over }), cfg)).toBe(false);
  });

  // BLOCKED is what GitHub says when a REQUIRED check is red — which is
  // precisely the PR the user was looking at when they called the check
  // broken. Refusing to promote it would leave ignoring useless exactly where
  // it is needed. The board already makes this leap for a green BLOCKED PR
  // (readyViaBlocked); once the ignored result is discounted, this is the same
  // PR. What is left of BLOCKED — a review gate — is checked separately.
  it.each([
    ["approved", "APPROVED"],
    ["a repo that requires no review at all", ""],
  ])("promotes a BLOCKED PR on %s", (_label, reviewDecision) => {
    expect(
      readyDespiteIgnored(s({ failing: ["flaky"], mergeState: "BLOCKED", reviewDecision }), cfg),
    ).toBe(true);
  });

  it("still refuses a BLOCKED PR that is waiting on a review", () => {
    expect(
      readyDespiteIgnored(
        s({ failing: ["flaky"], mergeState: "BLOCKED", reviewDecision: "REVIEW_REQUIRED" }),
        cfg,
      ),
    ).toBe(false);
  });
});

describe("readyFromStuck", () => {
  it("carries the PR over with the age it was already showing", () => {
    const pr = stuckPr({
      id: "PR_1",
      title: "Bump the parser",
      url: "https://github.com/acme/api/pull/7",
      number: 7,
      repo: "acme/api",
      checkNames: ["flaky", "build"],
      failing: ["flaky"],
      stuckSince: "2026-08-01T00:00:00Z",
    });
    expect(readyFromStuck(pr)).toEqual({
      id: "PR_1",
      title: "Bump the parser",
      url: "https://github.com/acme/api/pull/7",
      number: 7,
      repo: "acme/api",
      readySince: "2026-08-01T00:00:00Z",
      needsUpdate: false,
      checkNames: ["flaky", "build"],
      viaBlocked: false,
      ignoredChecks: ["flaky"],
    });
  });

  // The card has to keep saying why the checks are not green, or a PR with a
  // red run reads as spotless.
  it("carries the names that were written off", () => {
    const pr = stuckPr({ repo: "acme/api", failing: ["flaky"], pending: ["slow"] });
    expect(readyFromStuck(pr).ignoredChecks).toEqual(["flaky", "slow"]);
  });

  it("keeps the Needs update badge for a branch that is behind", () => {
    expect(readyFromStuck(stuckPr({ repo: "acme/api", mergeState: "BEHIND" })).needsUpdate).toBe(true);
  });
});
