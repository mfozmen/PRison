import { describe, it, expect } from "vitest";
import { searchQuery, parseStuckPrs, parseReviewRequests, parseOrgs } from "./queries";

describe("searchQuery", () => {
  it("scopes author search to the org", () => {
    expect(searchQuery("author", "acme")).toBe("is:open is:pr author:@me org:acme");
  });
  it("scopes review search to the org", () => {
    expect(searchQuery("review", "acme")).toBe("is:open is:pr review-requested:@me org:acme");
  });
});

describe("parseStuckPrs", () => {
  const raw = {
    search: { nodes: [
      { __typename: "PullRequest", id: "1", title: "green", url: "u1", number: 1,
        repository: { nameWithOwner: "acme/a" },
        commits: { nodes: [{ commit: { pushedDate: "2026-06-25T00:00:00Z",
          statusCheckRollup: { contexts: { nodes: [{ conclusion: "SUCCESS" }] } } } }] } },
      { __typename: "PullRequest", id: "2", title: "stuck", url: "u2", number: 2,
        repository: { nameWithOwner: "acme/b" },
        commits: { nodes: [{ commit: { pushedDate: "2026-06-20T00:00:00Z",
          statusCheckRollup: { contexts: { nodes: [
            { conclusion: "FAILURE" }, { conclusion: "FAILURE" }, { status: "IN_PROGRESS" },
          ] } } } }] } },
    ] },
  };
  it("keeps only PRs with failing or pending checks", () => {
    const prs = parseStuckPrs(raw);
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      id: "2", title: "stuck", url: "u2", repo: "acme/b", number: 2,
      failingChecks: 2, pendingChecks: 1, stuckSince: "2026-06-20T00:00:00Z",
    });
  });
});

describe("parseReviewRequests", () => {
  const raw = {
    search: { nodes: [
      { id: "9", title: "needs me", url: "u9", number: 9,
        repository: { nameWithOwner: "acme/c" },
        author: { login: "alice" },
        timelineItems: { nodes: [
          { requestedReviewer: { login: "me" }, createdAt: "2026-06-22T00:00:00Z" },
          { requestedReviewer: { login: "bob" }, createdAt: "2026-06-23T00:00:00Z" },
        ] } },
    ] },
  };
  it("uses the createdAt of my review request", () => {
    const reqs = parseReviewRequests(raw, "me");
    expect(reqs[0]).toMatchObject({
      id: "9", author: "alice", repo: "acme/c", requestedAt: "2026-06-22T00:00:00Z",
    });
  });
});

describe("parseOrgs", () => {
  it("maps login and avatar", () => {
    const raw = { viewer: { organizations: { nodes: [{ login: "acme", avatarUrl: "a" }] } } };
    expect(parseOrgs(raw)).toEqual([{ login: "acme", avatarUrl: "a" }]);
  });
});
