import { describe, it, expect } from "vitest";
import { suggestStuck, suggestReview, suggestReady, suggestComment, stuckGroupKeys, reviewDecisionLabel } from "./suggest";
import { EMPTY_TRACKED } from "./tracked-checks";
import { stuckPr, reviewRequest, readyPr } from "./fixtures";
import type { StuckPr, PrComment } from "./types";

// Every case here pins the same PR identity and varies only the blocker, so the
// builder supplies the other dozen fields.
const pr = (overrides: Partial<StuckPr> = {}): StuckPr =>
  stuckPr({ id: "1", title: "t", url: "https://github.com/acme/b/pull/2", number: 2, repo: "acme/b", stuckSince: "x", ...overrides });

describe("suggestStuck", () => {
  it("suggests re-running checks when failing", () => {
    const target = pr({ failingChecks: 2, failing: ["build", "lint"], checkNames: ["build", "lint"] });
    expect(suggestStuck(target)).toEqual({
      text: "Re-run failed checks",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
  it("suggests investigating CI when only pending", () => {
    const target = pr({ pendingChecks: 1, pending: ["ci"], checkNames: ["ci"] });
    expect(suggestStuck(target)).toEqual({
      text: "Investigate pending CI",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
  it("blocked (BLOCKED) with no visible checks → 'See required checks'", () => {
    const target = pr({ blocked: true, mergeState: "BLOCKED" });
    expect(suggestStuck(target)).toEqual({
      text: "See required checks",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
  // BEHIND PRs are no longer in stuck — they move to the ready-to-merge list
  // with needsUpdate: true. The "Update branch" suggestion is therefore dead;
  // its test has been removed.
  it("DIRTY-only (no failing/pending) → 'Resolve conflicts' linking to pr.url", () => {
    const target = pr({ blocked: true, mergeState: "DIRTY" });
    expect(suggestStuck(target)).toEqual({
      text: "Resolve conflicts",
      href: "https://github.com/acme/b/pull/2",
    });
  });
  it("REVIEW_REQUIRED with no failing/pending checks → 'Request code owner review' linking to the PR", () => {
    const target = pr({ blocked: true, reviewDecision: "REVIEW_REQUIRED", mergeState: "BLOCKED" });
    expect(suggestStuck(target)).toEqual({
      text: "Request code owner review",
      href: "https://github.com/acme/b/pull/2",
    });
  });
  it("CHANGES_REQUESTED with no failing/pending checks → 'Address review feedback' linking to files", () => {
    const target = pr({ blocked: true, reviewDecision: "CHANGES_REQUESTED", mergeState: "BLOCKED" });
    expect(suggestStuck(target)).toEqual({
      text: "Address review feedback",
      href: "https://github.com/acme/b/pull/2/files",
    });
  });
  it("DIRTY takes priority over a failing check → 'Resolve conflicts'", () => {
    // A re-run cannot merge a conflicted PR, and resolving the conflict means a
    // push, which re-runs the checks anyway.
    const target = pr({ blocked: true, mergeState: "DIRTY", failingChecks: 1, failing: ["ci"] });
    expect(suggestStuck(target)).toEqual({ text: "Resolve conflicts", href: target.url });
  });

  it("DIRTY takes priority over a review gate → 'Resolve conflicts' (matches the Dashboard's conflicts note)", () => {
    // A PR can be DIRTY and REVIEW_REQUIRED at once. The Dashboard renders the
    // merge-conflict note (DIRTY wins), so the suggestion must agree — conflicts
    // block the merge regardless of review state.
    const target = pr({ blocked: true, reviewDecision: "REVIEW_REQUIRED", mergeState: "DIRTY" });
    expect(suggestStuck(target)).toEqual({
      text: "Resolve conflicts",
      href: "https://github.com/acme/b/pull/2",
    });
  });
  it("failing checks take priority even when BLOCKED → 'Re-run failed checks'", () => {
    // BEHIND is no longer in stuck; use BLOCKED to exercise the same code path.
    const target = pr({ failingChecks: 1, failing: ["build"], checkNames: ["build"], blocked: true, mergeState: "BLOCKED" });
    expect(suggestStuck(target)).toEqual({
      text: "Re-run failed checks",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
});

describe("suggestReview", () => {
  it("suggests reviewing to unblock the author", () => {
    const req = reviewRequest({ url: "https://github.com/acme/b/pull/2", author: "alice" });
    expect(suggestReview(req)).toEqual({
      text: "Review to unblock alice",
      href: "https://github.com/acme/b/pull/2/files",
    });
  });
});

describe("reviewDecisionLabel", () => {
  it("maps CHANGES_REQUESTED to 'Changes requested', everything else to 'Review required'", () => {
    expect(reviewDecisionLabel("CHANGES_REQUESTED")).toBe("Changes requested");
    expect(reviewDecisionLabel("REVIEW_REQUIRED")).toBe("Review required");
  });
});

describe("stuckGroupKeys", () => {
  const s = (over: Partial<StuckPr> = {}): StuckPr =>
    stuckPr({ url: "u", repo: "acme/b", blocked: true, mergeState: "BLOCKED", stuckSince: "x", ...over });

  it("groups by failing and pending check names", () => {
    expect(stuckGroupKeys(s({ failing: ["build"], pending: ["ci"] }), EMPTY_TRACKED)).toEqual(["build", "ci"]);
  });
  it("REVIEW_REQUIRED with no checks → 'Review required' (not Other)", () => {
    expect(stuckGroupKeys(s({ reviewDecision: "REVIEW_REQUIRED" }), EMPTY_TRACKED)).toEqual(["Review required"]);
  });
  it("CHANGES_REQUESTED → 'Changes requested'", () => {
    expect(stuckGroupKeys(s({ reviewDecision: "CHANGES_REQUESTED" }), EMPTY_TRACKED)).toEqual(["Changes requested"]);
  });
  it("includes awaiting tracked checks alongside the review bucket", () => {
    const tracked = { orgs: {}, repos: { "acme/b": ["qa/smoke", "Automation Result"] } };
    expect(stuckGroupKeys(s({ reviewDecision: "REVIEW_REQUIRED", checkNames: [] }), tracked)).toEqual([
      "qa/smoke",
      "Automation Result",
      "Review required",
    ]);
  });
  // Group-by-check names the reasons a PR is stuck. A check the user said
  // cannot block the merge is not one of them.
  it("leaves a not-required awaiting check out of the buckets", () => {
    const tracked = {
      orgs: {},
      repos: { "acme/b": [{ name: "nightly-e2e", required: false }] },
    };
    expect(stuckGroupKeys(s({ failing: ["build"], checkNames: [] }), tracked)).toEqual(["build"]);
  });

  it("falls back to Other when only a not-required check is outstanding", () => {
    const tracked = {
      orgs: {},
      repos: { "acme/b": [{ name: "nightly-e2e", required: false }] },
    };
    expect(stuckGroupKeys(s({ checkNames: [] }), tracked)).toEqual(["Other"]);
  });

  // "Other" is for blockers the board cannot name, and it can name this one.
  it("DIRTY with nothing else against it → 'Merge conflict' (not Other)", () => {
    expect(stuckGroupKeys(s({ mergeState: "DIRTY" }), EMPTY_TRACKED)).toEqual([
      "Merge conflict",
    ]);
  });
  it("groups a conflicted PR under its checks and the conflict both", () => {
    expect(stuckGroupKeys(s({ mergeState: "DIRTY", failing: ["build"] }), EMPTY_TRACKED)).toEqual([
      "build",
      "Merge conflict",
    ]);
  });
  it("falls back to 'Other' when nothing is groupable", () => {
    expect(stuckGroupKeys(s({}), EMPTY_TRACKED)).toEqual(["Other"]);
  });
});

describe("suggestComment", () => {
  it("links straight to the comment anchor, not the PR", () => {
    const c: PrComment = {
      id: "t1", prId: "PR_1", url: "https://github.com/acme/b/pull/2#discussion_r1",
      repo: "acme/b", number: 2, author: "alice", isBot: false,
      path: "src/app.ts", source: "thread", preview: "please fix", commentedAt: "x", viewerReacted: false,
      viewerStarted: false,
    };
    expect(suggestComment(c)).toEqual({
      text: "Reply to alice",
      href: "https://github.com/acme/b/pull/2#discussion_r1",
    });
  });
});

describe("suggestReady", () => {
  it("links to the PR on GitHub to merge manually", () => {
    const target = readyPr({ url: "https://github.com/acme/b/pull/2" });
    expect(suggestReady(target)).toEqual({
      text: "Merge on GitHub",
      href: "https://github.com/acme/b/pull/2",
    });
  });
});

describe("stuckGroupKeys with ignored checks", () => {
  const s = (over: Partial<StuckPr> = {}): StuckPr =>
    stuckPr({ url: "u", repo: "acme/b", blocked: true, mergeState: "BLOCKED", stuckSince: "x", ...over });
  const ignored = { orgs: {}, repos: { "acme/b": ["flaky"] } };

  // "By check" names the reasons a PR is stuck. A check the user threw out is
  // not one of them — a bucket for it would collect every PR in the org under
  // the one name they said they never want to think about again.
  it("drops an ignored name from the buckets", () => {
    expect(stuckGroupKeys(s({ failing: ["flaky", "build"] }), EMPTY_TRACKED, ignored)).toEqual(["build"]);
  });

  it("falls back to Other when every blocker was ignored", () => {
    expect(stuckGroupKeys(s({ failing: ["flaky"] }), EMPTY_TRACKED, ignored)).toEqual(["Other"]);
  });

  it("drops an awaited tracked check the user later ignored", () => {
    const tracked = { orgs: {}, repos: { "acme/b": ["flaky", "qa/smoke"] } };
    expect(stuckGroupKeys(s({ checkNames: [] }), tracked, ignored)).toEqual(["qa/smoke"]);
  });
});
