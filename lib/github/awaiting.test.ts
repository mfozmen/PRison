import { describe, it, expect } from "vitest";
import { parseAwaitingReviewers, AWAITING_REVIEWERS_QUERY } from "./queries";

// One of the viewer's own PRs as the search returns it; each test overrides
// the part it is about.
function pr(over: Record<string, unknown> = {}) {
  return {
    id: "PR_1", title: "Add an audit log", url: "https://github.com/acme/api/pull/491",
    number: 491, isDraft: false, createdAt: "2026-11-10T09:00:00Z",
    repository: { nameWithOwner: "acme/api" },
    author: { login: "me" },
    reviewRequests: { nodes: [] },
    timelineItems: { nodes: [] },
    latestReviews: { nodes: [] },
    commits: { nodes: [{ commit: { pushedDate: "2026-11-10T09:00:00Z", committedDate: "2026-11-10T08:00:00Z" } }] },
    ...over,
  };
}
const raw = (...nodes: unknown[]) => ({ search: { nodes } });
const requested = (login: string) => ({ requestedReviewer: { __typename: "User", login } });
const team = (combinedSlug: string) => ({ requestedReviewer: { __typename: "Team", combinedSlug } });
const asked = (login: string, createdAt: string) => ({ createdAt, requestedReviewer: { login } });
const review = (login: string, state: string, submittedAt: string) => ({ state, submittedAt, author: { login } });

describe("parseAwaitingReviewers", () => {
  it("asks for what it reads: requests, request times, verdicts and the last push", () => {
    for (const field of ["reviewRequests", "REVIEW_REQUESTED_EVENT", "latestReviews", "combinedSlug", "pushedDate"]) {
      expect(AWAITING_REVIEWERS_QUERY).toContain(field);
    }
  });

  it("dates a pending request from its latest request event", () => {
    const [p] = parseAwaitingReviewers(raw(pr({
      reviewRequests: { nodes: [requested("alice")] },
      timelineItems: { nodes: [asked("alice", "2026-11-11T09:00:00Z"), asked("alice", "2026-11-12T09:00:00Z")] },
    })));
    expect(p.reviewers).toEqual([{ name: "alice", team: false, state: "requested", since: "2026-11-12T09:00:00Z" }]);
    expect(p.waitingSince).toBe("2026-11-12T09:00:00Z");
  });

  it("falls back to when the PR was opened for a request with no event", () => {
    const [p] = parseAwaitingReviewers(raw(pr({ reviewRequests: { nodes: [team("acme/backend")] } })));
    expect(p.reviewers[0]).toMatchObject({ name: "acme/backend", team: true, since: "2026-11-10T09:00:00Z" });
  });

  it("waits on a reviewer who asked for changes once the author has pushed since", () => {
    const [p] = parseAwaitingReviewers(raw(pr({
      latestReviews: { nodes: [review("carol", "CHANGES_REQUESTED", "2026-11-09T09:00:00Z")] },
    })));
    expect(p.reviewers).toEqual([
      { name: "carol", team: false, state: "changes", since: "2026-11-10T09:00:00Z", pushedSince: true },
    ]);
    expect(p.waitingSince).toBe("2026-11-10T09:00:00Z");
  });

  it("drops a PR whose changes request is still the author's to answer", () => {
    expect(parseAwaitingReviewers(raw(pr({
      latestReviews: { nodes: [review("carol", "CHANGES_REQUESTED", "2026-11-11T09:00:00Z")] },
    })))).toEqual([]);
  });

  it("lists approvals and comments beside the pending request, without waiting on them", () => {
    const [p] = parseAwaitingReviewers(raw(pr({
      reviewRequests: { nodes: [requested("alice")] },
      timelineItems: { nodes: [asked("alice", "2026-11-12T09:00:00Z")] },
      latestReviews: { nodes: [
        review("dave", "APPROVED", "2026-11-11T09:00:00Z"),
        review("bob", "COMMENTED", "2026-11-11T10:00:00Z"),
        review("me", "COMMENTED", "2026-11-11T11:00:00Z"),
        review("erin", "DISMISSED", "2026-11-11T12:00:00Z"),
      ] },
    })));
    expect(p.reviewers.map((r) => [r.name, r.state])).toEqual([
      ["alice", "requested"], ["dave", "approved"], ["bob", "commented"],
    ]);
    expect(p.waitingSince).toBe("2026-11-12T09:00:00Z");
  });

  it("shows a re-requested reviewer once, as requested", () => {
    const [p] = parseAwaitingReviewers(raw(pr({
      reviewRequests: { nodes: [requested("carol")] },
      timelineItems: { nodes: [asked("carol", "2026-11-12T09:00:00Z")] },
      latestReviews: { nodes: [review("carol", "CHANGES_REQUESTED", "2026-11-11T09:00:00Z")] },
    })));
    expect(p.reviewers).toEqual([{ name: "carol", team: false, state: "requested", since: "2026-11-12T09:00:00Z" }]);
  });

  it("skips PRs nobody is asked to review", () => {
    expect(parseAwaitingReviewers(raw(pr(), { notAPr: true }))).toEqual([]);
    expect(parseAwaitingReviewers({})).toEqual([]);
  });
});
