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
  it("falls back to 'Other' when nothing is groupable", () => {
    expect(stuckGroupKeys(s({}), EMPTY_TRACKED)).toEqual(["Other"]);
  });
});

describe("suggestComment", () => {
  it("links straight to the comment anchor, not the PR", () => {
    const c: PrComment = {
      id: "t1", prId: "PR_1", url: "https://github.com/acme/b/pull/2#discussion_r1",
      repo: "acme/b", number: 2, author: "alice", isBot: false,
      path: "src/app.ts", preview: "please fix", commentedAt: "x",
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
