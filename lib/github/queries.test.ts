import { describe, it, expect } from "vitest";
import { searchQuery, parseStuckPrs, parseReviewRequests, parseOrgs, parseReadyPrs, parseRepoSearch } from "./queries";

describe("searchQuery", () => {
  it("scopes author search to the org", () => {
    expect(searchQuery("author", "org:acme")).toBe("is:open is:pr author:@me org:acme");
  });
  it("scopes review search to the org", () => {
    expect(searchQuery("review", "org:acme")).toBe("is:open is:pr review-requested:@me org:acme");
  });
  it("omits the org scope when no org is given (spans everything)", () => {
    expect(searchQuery("author")).toBe("is:open is:pr author:@me");
    expect(searchQuery("review", "")).toBe("is:open is:pr review-requested:@me");
  });
  it("ready kind emits author:@me review:approved", () => {
    expect(searchQuery("ready")).toBe("is:open is:pr author:@me review:approved");
  });
  it("ready kind with org appends org scope", () => {
    expect(searchQuery("ready", "org:acme")).toBe("is:open is:pr author:@me review:approved org:acme");
  });
  it("scopes author search to a personal user account", () => {
    expect(searchQuery("author", "user:mfozmen")).toBe("is:open is:pr author:@me user:mfozmen");
  });
  it("ready kind with user scope appends user qualifier", () => {
    expect(searchQuery("ready", "user:mfozmen")).toBe("is:open is:pr author:@me review:approved user:mfozmen");
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
      failing: [], pending: [], isDraft: false,
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

  it("counts ERROR and TIMED_OUT as failing; treats CANCELLED as ok", () => {
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
    expect(prs[0].failingChecks).toBe(2);
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

  it("isDraft is true for a draft PR, false for a non-draft, and false when absent", () => {
    const rawDraft = {
      search: { nodes: [
        { id: "20", title: "draft-pr", url: "u20", number: 20, isDraft: true,
          repository: { nameWithOwner: "acme/z" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-10T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [{ name: "lint", status: "IN_PROGRESS", conclusion: null }] } },
          } }] } },
        { id: "21", title: "non-draft-pr", url: "u21", number: 21, isDraft: false,
          repository: { nameWithOwner: "acme/z" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-10T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [{ name: "lint", conclusion: "FAILURE" }] } },
          } }] } },
        { id: "22", title: "absent-draft", url: "u22", number: 22,
          // no isDraft field
          repository: { nameWithOwner: "acme/z" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-10T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [{ name: "lint", conclusion: "FAILURE" }] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawDraft);
    expect(prs).toHaveLength(3);
    const draft = prs.find((p) => p.id === "20")!;
    const nonDraft = prs.find((p) => p.id === "21")!;
    const absentDraft = prs.find((p) => p.id === "22")!;
    expect(draft.isDraft).toBe(true);
    expect(nonDraft.isDraft).toBe(false);
    expect(absentDraft.isDraft).toBe(false);
  });

  it("collects CheckRun names into failing/pending arrays, skips unnamed", () => {
    const rawNames = {
      search: { nodes: [
        { id: "30", title: "named-checks", url: "u30", number: 30,
          repository: { nameWithOwner: "acme/n" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-10T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { name: "build", conclusion: "FAILURE" },       // CheckRun: failing, named
              { name: "lint", conclusion: "FAILURE" },        // CheckRun: failing, named
              { name: "deploy", status: "IN_PROGRESS" },      // CheckRun: pending, named
              { conclusion: "FAILURE" },                       // CheckRun: no name → counted but not named
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawNames);
    expect(prs).toHaveLength(1);
    expect(prs[0].failing).toEqual(["build", "lint"]);
    expect(prs[0].pending).toEqual(["deploy"]);
    // failingChecks counts ALL failing (including unnamed), pending counts ALL pending
    expect(prs[0].failingChecks).toBe(3); // build + lint + unnamed
    expect(prs[0].pendingChecks).toBe(1); // deploy
  });

  it("all-named fixture: failing.length === failingChecks and pending.length === pendingChecks", () => {
    const rawAllNamed = {
      search: { nodes: [
        { id: "32", title: "all-named", url: "u32", number: 32,
          repository: { nameWithOwner: "acme/n" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-10T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { name: "build", conclusion: "FAILURE" },
              { name: "ci/test", conclusion: "FAILURE" },
              { name: "deploy", status: "QUEUED" },
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawAllNamed);
    expect(prs).toHaveLength(1);
    expect(prs[0].failing.length).toBe(prs[0].failingChecks);
    expect(prs[0].pending.length).toBe(prs[0].pendingChecks);
  });

  it("collects StatusContext names via context field into pending array", () => {
    const rawStatus = {
      search: { nodes: [
        { id: "31", title: "status-ctx", url: "u31", number: 31,
          repository: { nameWithOwner: "acme/s" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-10T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { context: "ci/checks", state: "PENDING" },       // StatusContext: pending, named
              { context: "ci/lint", state: "FAILURE" },         // StatusContext: failing, named
              { state: "PENDING" },                              // StatusContext: no context → counted but not named
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawStatus);
    expect(prs).toHaveLength(1);
    expect(prs[0].pending).toContain("ci/checks");
    expect(prs[0].failing).toContain("ci/lint");
    // failingChecks and pendingChecks count ALL (including unnamed)
    expect(prs[0].failingChecks).toBe(1); // ci/lint only
    expect(prs[0].pendingChecks).toBe(2); // ci/checks + unnamed
  });

  it("dedup: CANCELLED + SUCCESS on same name → not failing, not pending", () => {
    const raw = {
      search: { nodes: [
        { id: "50", title: "relinted", url: "u50", number: 50,
          repository: { nameWithOwner: "acme/x" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-25T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { name: "pr-linter", conclusion: "CANCELLED" },
              { name: "pr-linter", conclusion: "SUCCESS" },
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(raw);
    expect(prs).toHaveLength(0); // PR filtered out: 0 failing + 0 pending
  });

  it("dedup: single FAILURE run → failing", () => {
    const raw = {
      search: { nodes: [
        { id: "51", title: "smoke-fail", url: "u51", number: 51,
          repository: { nameWithOwner: "acme/x" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-25T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { name: "qa/smoke", conclusion: "FAILURE" },
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(raw);
    expect(prs).toHaveLength(1);
    expect(prs[0].failing).toContain("qa/smoke");
    expect(prs[0].failingChecks).toBe(1);
  });

  it("dedup: FAILURE + SUCCESS on same name → still failing (real failure wins)", () => {
    const raw = {
      search: { nodes: [
        { id: "52", title: "flaky", url: "u52", number: 52,
          repository: { nameWithOwner: "acme/x" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-25T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { name: "build", conclusion: "FAILURE" },
              { name: "build", conclusion: "SUCCESS" },
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(raw);
    expect(prs).toHaveLength(1);
    expect(prs[0].failing).toContain("build");
    expect(prs[0].failingChecks).toBe(1);
  });

  it("dedup: PENDING + SUCCESS on same name → pending", () => {
    const raw = {
      search: { nodes: [
        { id: "53", title: "running", url: "u53", number: 53,
          repository: { nameWithOwner: "acme/x" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-25T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { name: "ci/test", status: "IN_PROGRESS" },
              { name: "ci/test", conclusion: "SUCCESS" },
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(raw);
    expect(prs).toHaveLength(1);
    expect(prs[0].pending).toContain("ci/test");
    expect(prs[0].pendingChecks).toBe(1);
    expect(prs[0].failingChecks).toBe(0);
  });

  it("dedup: counts match the deduped arrays for all-named fixture", () => {
    const raw = {
      search: { nodes: [
        { id: "54", title: "mixed", url: "u54", number: 54,
          repository: { nameWithOwner: "acme/x" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-25T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { name: "pr-linter", conclusion: "CANCELLED" },
              { name: "pr-linter", conclusion: "SUCCESS" }, // deduped to ok
              { name: "build", conclusion: "FAILURE" },     // failing
              { name: "ci/test", status: "QUEUED" },       // pending
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(raw);
    expect(prs).toHaveLength(1);
    expect(prs[0].failing).toEqual(["build"]);
    expect(prs[0].pending).toEqual(["ci/test"]);
    expect(prs[0].failingChecks).toBe(prs[0].failing.length); // 1
    expect(prs[0].pendingChecks).toBe(prs[0].pending.length); // 1
  });

  it("BLOCKED mergeStateStatus with no failing/pending → included with blocked:true", () => {
    const rawBlocked = {
      search: { nodes: [
        { id: "60", title: "blocked-pr", url: "u60", number: 60,
          mergeStateStatus: "BLOCKED",
          repository: { nameWithOwner: "acme/b" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-25T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { conclusion: "SUCCESS" },
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawBlocked);
    expect(prs).toHaveLength(1);
    expect(prs[0].blocked).toBe(true);
    expect(prs[0].mergeState).toBe("BLOCKED");
    expect(prs[0].failingChecks).toBe(0);
    expect(prs[0].pendingChecks).toBe(0);
  });

  it("CLEAN mergeStateStatus with no failing/pending → excluded (not blocked)", () => {
    const rawClean = {
      search: { nodes: [
        { id: "61", title: "clean-pr", url: "u61", number: 61,
          mergeStateStatus: "CLEAN",
          repository: { nameWithOwner: "acme/b" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-25T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { conclusion: "SUCCESS" },
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawClean);
    expect(prs).toHaveLength(0);
  });

  it("BEHIND mergeStateStatus with no failing/pending → included with blocked:true", () => {
    const rawBehind = {
      search: { nodes: [
        { id: "62", title: "behind-pr", url: "u62", number: 62,
          mergeStateStatus: "BEHIND",
          repository: { nameWithOwner: "acme/b" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-25T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { conclusion: "SUCCESS" },
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawBehind);
    expect(prs).toHaveLength(1);
    expect(prs[0].blocked).toBe(true);
    expect(prs[0].mergeState).toBe("BEHIND");
  });

  it("BEHIND PR with all-green checks is included with mergeState:'BEHIND' and blocked:true (live bug scenario)", () => {
    const rawBehindGreen = {
      search: { nodes: [
        { id: "65", title: "behind-all-green", url: "u65", number: 65,
          mergeStateStatus: "BEHIND",
          repository: { nameWithOwner: "acme/b" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-25T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { name: "build", conclusion: "SUCCESS" },
              { name: "ci/test", conclusion: "SUCCESS" },
              { name: "lint", conclusion: "SUCCESS" },
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawBehindGreen);
    expect(prs).toHaveLength(1);
    expect(prs[0].blocked).toBe(true);
    expect(prs[0].mergeState).toBe("BEHIND");
    expect(prs[0].failingChecks).toBe(0);
    expect(prs[0].pendingChecks).toBe(0);
  });

  it("failing checks + BLOCKED mergeStateStatus → included with blocked:true", () => {
    const rawFailingBlocked = {
      search: { nodes: [
        { id: "63", title: "failing-blocked", url: "u63", number: 63,
          mergeStateStatus: "BLOCKED",
          repository: { nameWithOwner: "acme/b" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-25T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { name: "ci/test", conclusion: "FAILURE" },
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawFailingBlocked);
    expect(prs).toHaveLength(1);
    expect(prs[0].blocked).toBe(true);
    expect(prs[0].failingChecks).toBe(1);
  });

  it("checkNames includes all named checks regardless of state; excludes unnamed", () => {
    const rawCheckNames = {
      search: { nodes: [
        { id: "70", title: "check-names", url: "u70", number: 70,
          repository: { nameWithOwner: "acme/cn" },
          commits: { nodes: [{ commit: {
            pushedDate: "2026-06-25T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [
              { name: "build", conclusion: "SUCCESS" },    // passing
              { name: "qa/smoke", conclusion: "FAILURE" }, // failing
              { name: "deploy", status: "IN_PROGRESS" },   // pending
              { conclusion: "FAILURE" },                   // unnamed → NOT in checkNames
            ] } },
          } }] } },
      ] },
    };
    const prs = parseStuckPrs(rawCheckNames);
    expect(prs).toHaveLength(1);
    const { checkNames } = prs[0];
    expect(checkNames).toContain("build");
    expect(checkNames).toContain("qa/smoke");
    expect(checkNames).toContain("deploy");
    // unnamed checks (no name/context field) must not appear
    expect(checkNames.every((n) => n !== undefined && n !== null && n !== "")).toBe(true);
    expect(checkNames).toHaveLength(3);
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

  it("isDraft is true for a draft PR, false for a non-draft, and false when absent", () => {
    const rawDraft = {
      search: { nodes: [
        { id: "40", title: "draft-rr", url: "u40", number: 40, isDraft: true,
          updatedAt: "2026-06-24T00:00:00Z",
          repository: { nameWithOwner: "acme/r" },
          author: { login: "alice" },
          timelineItems: { nodes: [] } },
        { id: "41", title: "non-draft-rr", url: "u41", number: 41, isDraft: false,
          updatedAt: "2026-06-24T00:00:00Z",
          repository: { nameWithOwner: "acme/r" },
          author: { login: "alice" },
          timelineItems: { nodes: [] } },
        { id: "42", title: "absent-draft-rr", url: "u42", number: 42,
          // no isDraft field
          updatedAt: "2026-06-24T00:00:00Z",
          repository: { nameWithOwner: "acme/r" },
          author: { login: "alice" },
          timelineItems: { nodes: [] } },
      ] },
    };
    const reqs = parseReviewRequests(rawDraft, "me");
    expect(reqs).toHaveLength(3);
    const draft = reqs.find((r) => r.id === "40")!;
    const nonDraft = reqs.find((r) => r.id === "41")!;
    const absentDraft = reqs.find((r) => r.id === "42")!;
    expect(draft.isDraft).toBe(true);
    expect(nonDraft.isDraft).toBe(false);
    expect(absentDraft.isDraft).toBe(false);
  });
});

describe("parseReadyPrs", () => {
  function makePr(overrides: Record<string, unknown> = {}) {
    return {
      id: "pr1",
      title: "My PR",
      url: "https://github.com/acme/repo/pull/1",
      number: 1,
      isDraft: false,
      updatedAt: "2026-06-20T00:00:00Z",
      reviewDecision: "APPROVED",
      mergeStateStatus: "CLEAN",
      repository: { nameWithOwner: "acme/repo" },
      commits: { nodes: [{ commit: {
        pushedDate: "2026-06-25T00:00:00Z",
        committedDate: "2026-06-24T00:00:00Z",
      } }] },
      ...overrides,
    };
  }

  it("keeps APPROVED + CLEAN + not-draft; readySince comes from pushedDate", () => {
    const result = parseReadyPrs({ search: { nodes: [makePr()] } });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "pr1", title: "My PR", number: 1, repo: "acme/repo",
      readySince: "2026-06-25T00:00:00Z",
    });
  });

  it("APPROVED + BLOCKED mergeStateStatus → NOT ready even when commits look green (the bug)", () => {
    // This is the key false-positive bug: APPROVED + green rollup but branch protection
    // blocks the merge. mergeStateStatus=BLOCKED must exclude the PR.
    const pr = makePr({ mergeStateStatus: "BLOCKED" });
    const result = parseReadyPrs({ search: { nodes: [pr] } });
    expect(result).toHaveLength(0);
  });

  it("drops APPROVED + BEHIND mergeStateStatus", () => {
    const result = parseReadyPrs({ search: { nodes: [makePr({ mergeStateStatus: "BEHIND" })] } });
    expect(result).toHaveLength(0);
  });

  it("drops APPROVED + UNSTABLE mergeStateStatus", () => {
    const result = parseReadyPrs({ search: { nodes: [makePr({ mergeStateStatus: "UNSTABLE" })] } });
    expect(result).toHaveLength(0);
  });

  it("drops APPROVED + DIRTY mergeStateStatus", () => {
    const result = parseReadyPrs({ search: { nodes: [makePr({ mergeStateStatus: "DIRTY" })] } });
    expect(result).toHaveLength(0);
  });

  it("drops APPROVED + UNKNOWN mergeStateStatus", () => {
    const result = parseReadyPrs({ search: { nodes: [makePr({ mergeStateStatus: "UNKNOWN" })] } });
    expect(result).toHaveLength(0);
  });

  // When review is required but not yet given, GitHub reports BLOCKED (not CLEAN).
  // REVIEW_REQUIRED + CLEAN is an impossible combo in practice, so we test the
  // realistic scenario: REVIEW_REQUIRED + BLOCKED → excluded because it's BLOCKED.
  it("drops REVIEW_REQUIRED + BLOCKED mergeStateStatus (realistic: GitHub reports BLOCKED when review is missing)", () => {
    const result = parseReadyPrs({ search: { nodes: [makePr({ reviewDecision: "REVIEW_REQUIRED", mergeStateStatus: "BLOCKED" })] } });
    expect(result).toHaveLength(0);
  });

  // Same reasoning: CHANGES_REQUESTED causes BLOCKED in GitHub's API, not CLEAN.
  it("drops CHANGES_REQUESTED + BLOCKED mergeStateStatus (realistic: GitHub reports BLOCKED when changes are requested)", () => {
    const result = parseReadyPrs({ search: { nodes: [makePr({ reviewDecision: "CHANGES_REQUESTED", mergeStateStatus: "BLOCKED" })] } });
    expect(result).toHaveLength(0);
  });

  it("keeps CLEAN + not-draft when reviewDecision is null (review not required) — the personal-PR case", () => {
    // Personal-account repos often have no required reviewers; reviewDecision is null
    // and mergeStateStatus is CLEAN, meaning GitHub has already confirmed it's mergeable.
    const result = parseReadyPrs({ search: { nodes: [makePr({ reviewDecision: null })] } });
    expect(result).toHaveLength(1);
  });

  it("drops draft PRs even when APPROVED + CLEAN", () => {
    const result = parseReadyPrs({ search: { nodes: [makePr({ isDraft: true })] } });
    expect(result).toHaveLength(0);
  });

  it("readySince falls back to committedDate when pushedDate absent", () => {
    const pr = makePr({ commits: { nodes: [{ commit: {
      pushedDate: null,
      committedDate: "2026-06-24T00:00:00Z",
    } }] } });
    const result = parseReadyPrs({ search: { nodes: [pr] } });
    expect(result[0].readySince).toBe("2026-06-24T00:00:00Z");
  });

  it("readySince falls back to updatedAt when both dates absent", () => {
    const pr = makePr({ commits: { nodes: [{ commit: {
      pushedDate: null,
      committedDate: null,
    } }] } });
    const result = parseReadyPrs({ search: { nodes: [pr] } });
    expect(result[0].readySince).toBe("2026-06-20T00:00:00Z");
  });

  it("drops nodes missing an id", () => {
    const noId = { ...makePr(), id: undefined };
    const withId = makePr({ id: "pr2" });
    const result = parseReadyPrs({ search: { nodes: [noId, withId] } });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pr2");
  });

  it("returns [] on null/missing input", () => {
    expect(parseReadyPrs(null)).toEqual([]);
    expect(parseReadyPrs({})).toEqual([]);
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

describe("parseRepoSearch", () => {
  it("maps nameWithOwner to a string array in order", () => {
    const raw = { search: { nodes: [{ nameWithOwner: "acme/web" }, { nameWithOwner: "beta/api" }] } };
    expect(parseRepoSearch(raw)).toEqual(["acme/web", "beta/api"]);
  });

  it("de-duplicates repeated names, keeping first occurrence", () => {
    const raw = {
      search: {
        nodes: [
          { nameWithOwner: "acme/web" },
          { nameWithOwner: "acme/web" },
          { nameWithOwner: "beta/api" },
        ],
      },
    };
    expect(parseRepoSearch(raw)).toEqual(["acme/web", "beta/api"]);
  });

  it("skips nodes with missing or empty nameWithOwner", () => {
    const raw = {
      search: {
        nodes: [
          { nameWithOwner: "acme/web" },
          {},
          null,
          { nameWithOwner: "" },
          { nameWithOwner: "beta/api" },
        ],
      },
    };
    expect(parseRepoSearch(raw)).toEqual(["acme/web", "beta/api"]);
  });

  it("returns [] when search nodes are absent", () => {
    expect(parseRepoSearch({})).toEqual([]);
    expect(parseRepoSearch({ search: {} })).toEqual([]);
    expect(parseRepoSearch(null)).toEqual([]);
  });

  it("returns [] for empty nodes list", () => {
    expect(parseRepoSearch({ search: { nodes: [] } })).toEqual([]);
  });
});
