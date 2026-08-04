import { vi } from "vitest";
import type { StuckPr, ReviewRequest, ReadyPr, PrComment, ClosedPr } from "./types";

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
    // Counts follow the names by default — GitHub can report a check with no
    // name, so the count may exceed the list, but it can never fall below it.
    // Override the count explicitly to model those unnamed checks.
    failingChecks: overrides.failing?.length ?? 0,
    pendingChecks: overrides.pending?.length ?? 0,
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

export function prComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: "THREAD_1",
    prId: "PR_stuck",
    url: "https://github.com/acme/api/pull/2#discussion_r1",
    repo: "acme/api",
    number: 2,
    author: "bob",
    isBot: false,
    path: "src/index.ts",
    preview: "Could you split this into two functions?",
    commentedAt: "2026-06-23T00:00:00Z",
    viewerReacted: false,
    ...overrides,
  };
}

export function closedPr(overrides: Partial<ClosedPr> = {}): ClosedPr {
  return {
    id: "PR_closed",
    title: "Drop the legacy exporter",
    url: "https://github.com/acme/web/pull/4",
    repo: "acme/web",
    number: 4,
    merged: true,
    endedAt: "2026-06-24T00:00:00Z",
    ...overrides,
  };
}

/**
 * Shared Notification stub for jsdom (which has no Notification at all).
 * Returns the constructed notifications, the requestPermission spy, and a
 * setter for the permission — the browser can change it out from under the
 * page, and a test that models that needs to as well. Callers clean up with
 * `vi.unstubAllGlobals()`.
 */
export function stubNotification(permission: NotificationPermission) {
  const constructed: Array<{ title: string; options?: NotificationOptions }> = [];
  const requestPermission = vi.fn().mockResolvedValue(permission);
  let current = permission;
  class FakeNotification {
    // A getter, not a field: the real Notification.permission is read-only to
    // the page too — only the browser moves it.
    static get permission(): NotificationPermission {
      return current;
    }
    static readonly requestPermission = requestPermission;
    constructor(title: string, options?: NotificationOptions) {
      constructed.push({ title, options });
    }
  }
  vi.stubGlobal("Notification", FakeNotification);
  const setPermission = (next: NotificationPermission) => {
    current = next;
  };
  return { constructed, requestPermission, setPermission };
}
