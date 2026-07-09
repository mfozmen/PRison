import { describe, it, expect } from "vitest";
import { suggestStuck, suggestReview, suggestReady, suggestComment, stuckGroupKeys, reviewDecisionLabel } from "./suggest";
import { EMPTY_TRACKED } from "./tracked-checks";
import type { StuckPr, ReviewRequest, ReadyPr, PrComment } from "./types";

const base = { id: "1", title: "t", url: "https://github.com/acme/b/pull/2", number: 2, repo: "acme/b" };

describe("suggestStuck", () => {
  it("suggests re-running checks when failing", () => {
    const pr: StuckPr = { ...base, failingChecks: 2, pendingChecks: 0, failing: ["build", "lint"], pending: [], checkNames: ["build", "lint"], isDraft: false, blocked: false, readyViaBlocked: false, reviewDecision: "", mergeState: "", stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "Re-run failed checks",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
  it("suggests investigating CI when only pending", () => {
    const pr: StuckPr = { ...base, failingChecks: 0, pendingChecks: 1, failing: [], pending: ["ci"], checkNames: ["ci"], isDraft: false, blocked: false, readyViaBlocked: false, reviewDecision: "", mergeState: "", stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "Investigate pending CI",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
  it("blocked (BLOCKED) with no visible checks → 'See required checks'", () => {
    const pr: StuckPr = { ...base, failingChecks: 0, pendingChecks: 0, failing: [], pending: [], checkNames: [], isDraft: false, blocked: true, readyViaBlocked: false, reviewDecision: "", mergeState: "BLOCKED", stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "See required checks",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
  // BEHIND PRs are no longer in stuck — they move to the ready-to-merge list
  // with needsUpdate: true. The "Update branch" suggestion is therefore dead;
  // its test has been removed.
  it("DIRTY-only (no failing/pending) → 'Resolve conflicts' linking to pr.url", () => {
    const pr: StuckPr = { ...base, failingChecks: 0, pendingChecks: 0, failing: [], pending: [], checkNames: [], isDraft: false, blocked: true, readyViaBlocked: false, reviewDecision: "", mergeState: "DIRTY", stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "Resolve conflicts",
      href: "https://github.com/acme/b/pull/2",
    });
  });
  it("REVIEW_REQUIRED with no failing/pending checks → 'Request code owner review' linking to the PR", () => {
    const pr: StuckPr = { ...base, failingChecks: 0, pendingChecks: 0, failing: [], pending: [], checkNames: [], isDraft: false, blocked: true, readyViaBlocked: false, reviewDecision: "REVIEW_REQUIRED", mergeState: "BLOCKED", stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "Request code owner review",
      href: "https://github.com/acme/b/pull/2",
    });
  });
  it("CHANGES_REQUESTED with no failing/pending checks → 'Address review feedback' linking to files", () => {
    const pr: StuckPr = { ...base, failingChecks: 0, pendingChecks: 0, failing: [], pending: [], checkNames: [], isDraft: false, blocked: true, readyViaBlocked: false, reviewDecision: "CHANGES_REQUESTED", mergeState: "BLOCKED", stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "Address review feedback",
      href: "https://github.com/acme/b/pull/2/files",
    });
  });
  it("DIRTY takes priority over a review gate → 'Resolve conflicts' (matches the Dashboard's conflicts note)", () => {
    // A PR can be DIRTY and REVIEW_REQUIRED at once. The Dashboard renders the
    // merge-conflict note (DIRTY wins), so the suggestion must agree — conflicts
    // block the merge regardless of review state.
    const pr: StuckPr = { ...base, failingChecks: 0, pendingChecks: 0, failing: [], pending: [], checkNames: [], isDraft: false, blocked: true, readyViaBlocked: false, reviewDecision: "REVIEW_REQUIRED", mergeState: "DIRTY", stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "Resolve conflicts",
      href: "https://github.com/acme/b/pull/2",
    });
  });
  it("failing checks take priority even when BLOCKED → 'Re-run failed checks'", () => {
    // BEHIND is no longer in stuck; use BLOCKED to exercise the same code path.
    const pr: StuckPr = { ...base, failingChecks: 1, pendingChecks: 0, failing: ["build"], pending: [], checkNames: ["build"], isDraft: false, blocked: true, readyViaBlocked: false, reviewDecision: "", mergeState: "BLOCKED", stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "Re-run failed checks",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
});

describe("suggestReview", () => {
  it("suggests reviewing to unblock the author", () => {
    const req: ReviewRequest = { ...base, author: "alice", requestedAt: "x", isDraft: false };
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
  const s = (over: Partial<StuckPr>): StuckPr => ({
    id: "1", title: "t", url: "u", number: 2, repo: "acme/b",
    failingChecks: 0, pendingChecks: 0, failing: [], pending: [], checkNames: [],
    isDraft: false, blocked: true, readyViaBlocked: false, reviewDecision: "",
    mergeState: "BLOCKED", stuckSince: "x",
    ...over,
  });

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
    const pr: ReadyPr = { id: "1", title: "t", url: "https://github.com/acme/b/pull/2", number: 2, repo: "acme/b", readySince: "x", needsUpdate: false, checkNames: [], viaBlocked: false };
    expect(suggestReady(pr)).toEqual({
      text: "Merge on GitHub",
      href: "https://github.com/acme/b/pull/2",
    });
  });
});
