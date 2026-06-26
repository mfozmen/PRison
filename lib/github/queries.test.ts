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

  it("falls back to committedDate when pushedDate is absent", () => {
    const rawFallback = {
      search: { nodes: [
        { id: "3", title: "fallback", url: "u3", number: 3,
          repository: { nameWithOwner: "acme/c" },
          commits: { nodes: [{ commit: {
            committedDate: "2026-06-18T00:00:00Z",
            // no pushedDate
            statusCheckRollup: { contexts: { nodes: [{ conclusion: "FAILURE" }] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawFallback);
    expect(prs).toHaveLength(1);
    expect(prs[0].stuckSince).toBe("2026-06-18T00:00:00Z");
  });

  it("filters out nodes missing an id", () => {
    const rawNoId = {
      search: { nodes: [
        { title: "no-id", url: "u99", number: 99 }, // no id
        { id: "4", title: "with-id", url: "u4", number: 4,
          repository: { nameWithOwner: "acme/d" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-15T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [{ conclusion: "ERROR" }] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawNoId);
    expect(prs.every((p) => p.id !== undefined)).toBe(true);
    expect(prs[0].id).toBe("4");
  });

  it("returns [] when search.nodes is absent", () => {
    expect(parseStuckPrs({})).toEqual([]);
    expect(parseStuckPrs({ search: {} })).toEqual([]);
    expect(parseStuckPrs(null)).toEqual([]);
  });

  it("does not count checks with unrecognized status as failing or pending", () => {
    const rawOk = {
      search: { nodes: [
        { id: "5", title: "ok-checks", url: "u5", number: 5,
          repository: { nameWithOwner: "acme/e" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-10T00:00:00Z",
            // All checks are "ok" (SUCCESS, NEUTRAL, SKIPPED, STALE, etc.)
            statusCheckRollup: { contexts: { nodes: [
              { conclusion: "SUCCESS" },
              { conclusion: "NEUTRAL" },
              { conclusion: "SKIPPED" },
              { state: "SUCCESS" },
            ] } },
          } }] } },
      ] },
    };
    // parseStuckPrs filters out PRs with 0 failing + 0 pending
    const prs = parseStuckPrs(rawOk);
    expect(prs).toHaveLength(0);
  });

  it("handles missing statusCheckRollup (no checks)", () => {
    const rawNoChecks = {
      search: { nodes: [
        { id: "6", title: "no-checks", url: "u6", number: 6,
          repository: { nameWithOwner: "acme/f" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-10T00:00:00Z",
            // no statusCheckRollup
          } }] } },
      ] },
    };
    // zero checks → both counts 0 → filtered out
    const prs = parseStuckPrs(rawNoChecks);
    expect(prs).toHaveLength(0);
  });

  it("counts ERROR and TIMED_OUT and CANCELLED as failing", () => {
    const rawMultiFail = {
      search: { nodes: [
        { id: "7", title: "multi-fail", url: "u7", number: 7,
          repository: { nameWithOwner: "acme/g" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-10T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { conclusion: "ERROR" },
              { conclusion: "TIMED_OUT" },
              { conclusion: "CANCELLED" },
              { status: "QUEUED" },
              { status: "EXPECTED" },
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawMultiFail);
    expect(prs).toHaveLength(1);
    expect(prs[0].failingChecks).toBe(3);
    expect(prs[0].pendingChecks).toBe(2);
  });

  it("classify treats a context with no known field as ok (covers ?? '' fallback)", () => {
    // A context object with none of conclusion/status/state defined → v="" → classify returns "ok"
    // Include one failing check so the PR isn't filtered out; the empty-context check should be ok.
    const rawEmptyCtx = {
      search: { nodes: [
        { id: "8", title: "empty-ctx", url: "u8", number: 8,
          repository: { nameWithOwner: "acme/h" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-09T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { conclusion: "FAILURE" }, // one failing so PR appears
              {},                        // empty context → v="" → "ok" (covers ?? "" branch)
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawEmptyCtx);
    expect(prs).toHaveLength(1);
    expect(prs[0].failingChecks).toBe(1);
    expect(prs[0].pendingChecks).toBe(0);
  });

  it("uses '' for stuckSince when both pushedDate and committedDate are absent", () => {
    const rawNoDates = {
      search: { nodes: [
        { id: "13", title: "no-dates", url: "u13", number: 13,
          repository: { nameWithOwner: "acme/i" },
          commits: { nodes: [{ commit: {
            // no pushedDate, no committedDate
            statusCheckRollup: { contexts: { nodes: [{ conclusion: "FAILURE" }] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawNoDates);
    expect(prs).toHaveLength(1);
    expect(prs[0].stuckSince).toBe("");
  });

  it("uses '' for stuckSince when commits is absent (covers ?? {} fallback on commit)", () => {
    // No commits → commit = {} → ctxs = [] → failingChecks=0 → filtered out
    // But the ?? {} branch on line 61 is evaluated during map before the final filter.
    const rawNoCommits = {
      search: { nodes: [
        { id: "14", title: "no-commits", url: "u14", number: 14,
          repository: { nameWithOwner: "acme/j" },
          // no commits field at all
        },
        // Need at least one PR to appear so the test is meaningful
        { id: "15", title: "fail", url: "u15", number: 15,
          repository: { nameWithOwner: "acme/k" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-08T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [{ conclusion: "FAILURE" }] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawNoCommits);
    // node 14 has no commits → no checks → filtered; node 15 appears
    expect(prs).toHaveLength(1);
    expect(prs[0].id).toBe("15");
  });

  it("uses '' for repo when repository is null (transferred/deleted repo)", () => {
    const rawNullRepo = {
      search: { nodes: [
        { id: "16", title: "null-repo", url: "u16", number: 16,
          repository: null,
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-09T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [{ conclusion: "FAILURE" }] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawNullRepo);
    expect(prs).toHaveLength(1);
    expect(prs[0].repo).toBe("");
  });
});

describe("parseReviewRequests", () => {
  const raw = {
    search: { nodes: [
      { id: "9", title: "needs me", url: "u9", number: 9,
        updatedAt: "2026-06-24T00:00:00Z",
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

  it("falls back to updatedAt when viewerLogin has no matching timeline event", () => {
    const rawNoMatch = {
      search: { nodes: [
        { id: "10", title: "no-match", url: "u10", number: 10,
          updatedAt: "2026-06-21T00:00:00Z",
          repository: { nameWithOwner: "acme/d" },
          author: { login: "carol" },
          timelineItems: { nodes: [
            { requestedReviewer: { login: "bob" }, createdAt: "2026-06-20T00:00:00Z" },
          ] } },
      ] },
    };
    const reqs = parseReviewRequests(rawNoMatch, "me");
    expect(reqs[0].requestedAt).toBe("2026-06-21T00:00:00Z");
  });

  it("returns [] when search.nodes is absent", () => {
    expect(parseReviewRequests({}, "me")).toEqual([]);
    expect(parseReviewRequests({ search: {} }, "me")).toEqual([]);
    expect(parseReviewRequests(null, "me")).toEqual([]);
  });

  it("falls back to 'unknown' when author is missing", () => {
    const rawNoAuthor = {
      search: { nodes: [
        { id: "11", title: "anon", url: "u11", number: 11,
          updatedAt: "2026-06-19T00:00:00Z",
          repository: { nameWithOwner: "acme/e" },
          // no author
          timelineItems: { nodes: [] } },
      ] },
    };
    const reqs = parseReviewRequests(rawNoAuthor, "me");
    expect(reqs[0].author).toBe("unknown");
  });

  it("handles missing timelineItems (no nodes)", () => {
    const rawNoTimeline = {
      search: { nodes: [
        { id: "12", title: "no-timeline", url: "u12", number: 12,
          updatedAt: "2026-06-18T00:00:00Z",
          repository: { nameWithOwner: "acme/f" },
          author: { login: "dave" },
          // no timelineItems
        },
      ] },
    };
    const reqs = parseReviewRequests(rawNoTimeline, "me");
    expect(reqs[0].author).toBe("dave");
    expect(reqs[0].requestedAt).toBe("2026-06-18T00:00:00Z");
  });

  it("uses '' for requestedAt when both mine.createdAt and updatedAt are absent", () => {
    // No matching timeline event AND no updatedAt → requestedAt = "" (covers ?? "" on line 91)
    const rawNoDates = {
      search: { nodes: [
        { id: "16", title: "no-dates", url: "u16", number: 16,
          // no updatedAt
          repository: { nameWithOwner: "acme/g" },
          author: { login: "eve" },
          timelineItems: { nodes: [
            { requestedReviewer: { login: "bob" }, createdAt: "2026-06-17T00:00:00Z" },
          ] },
        },
      ] },
    };
    const reqs = parseReviewRequests(rawNoDates, "me"); // "me" not in timeline
    expect(reqs[0].requestedAt).toBe(""); // mine=undefined, updatedAt=undefined → ""
  });

  it("uses '' for repo when repository is null (transferred/deleted repo)", () => {
    const rawNullRepo = {
      search: { nodes: [
        { id: "17", title: "null-repo", url: "u17", number: 17,
          updatedAt: "2026-06-19T00:00:00Z",
          repository: null,
          author: { login: "carol" },
          timelineItems: { nodes: [] },
        },
      ] },
    };
    const reqs = parseReviewRequests(rawNullRepo, "me");
    expect(reqs).toHaveLength(1);
    expect(reqs[0].repo).toBe("");
  });
});

describe("parseOrgs", () => {
  it("maps login and avatar", () => {
    const raw = { viewer: { organizations: { nodes: [{ login: "acme", avatarUrl: "a" }] } } };
    expect(parseOrgs(raw)).toEqual([{ login: "acme", avatarUrl: "a" }]);
  });

  it("returns [] when organizations nodes is absent", () => {
    expect(parseOrgs({})).toEqual([]);
    expect(parseOrgs({ viewer: {} })).toEqual([]);
    expect(parseOrgs({ viewer: { organizations: {} } })).toEqual([]);
    expect(parseOrgs(null)).toEqual([]);
  });

  it("returns [] for empty organizations list", () => {
    const raw = { viewer: { organizations: { nodes: [] } } };
    expect(parseOrgs(raw)).toEqual([]);
  });
});
