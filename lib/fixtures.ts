import type { StuckPr, ReviewRequest, ReadyPr } from "./types";

/**
 * Test data builders. PRison is a public repository: fixtures must never carry a
 * real organization, repository, or person. Build them from here instead of
 * hand-writing literals, and the names stay generic by construction.
 *
 * `lib/generic-fixtures.ts` enforces the same rule with an allowlist —
 * these builders are how you satisfy it without thinking about it.
 *
 * The values are FIXED, not random: a test that asserts on a date or a title
 * needs that value to be the same on every run. Randomised fakers make failures
 * irreproducible. Override exactly the fields a test cares about:
 *
 *     const pr = stuckPr({ failingChecks: 2, failing: ["build"] });
 */

export function stuckPr(overrides: Partial<StuckPr> = {}): StuckPr {
  return {
    id: "PR_stuck",
    title: "Add pagination to the report list",
    url: "https://github.com/acme/api/pull/2",
    repo: "acme/api",
    number: 2,
    failingChecks: 0,
    pendingChecks: 0,
    failing: [],
    pending: [],
    checkNames: [],
    isDraft: false,
    blocked: false,
    readyViaBlocked: false,
    reviewDecision: "",
    mergeState: "",
    stuckSince: "2026-06-20T00:00:00Z",
    ...overrides,
  };
}

export function reviewRequest(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    id: "PR_review",
    title: "Extract the retry policy",
    url: "https://github.com/acme/web/pull/9",
    repo: "acme/web",
    number: 9,
    author: "alice",
    requestedAt: "2026-06-22T00:00:00Z",
    isDraft: false,
    ...overrides,
  };
}

export function readyPr(overrides: Partial<ReadyPr> = {}): ReadyPr {
  return {
    id: "PR_ready",
    title: "Bump the client timeout",
    url: "https://github.com/acme/worker/pull/5",
    repo: "acme/worker",
    number: 5,
    readySince: "2026-06-21T00:00:00Z",
    needsUpdate: false,
    checkNames: [],
    viaBlocked: false,
    ...overrides,
  };
}
