import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import { Dashboard } from "./Dashboard";
import { closedPr, stubNotification } from "@/lib/fixtures";
import { POLL_INTERVAL_OPTIONS, DEFAULT_POLL_INTERVAL_MS } from "@/lib/notify";

/** Shortest offered interval — keeps the fake-timer arithmetic short. */
const POLL_MS = POLL_INTERVAL_OPTIONS[0].ms;

const STUCK_PR = {
  id: "2",
  title: "stuck pr",
  url: "u",
  repo: "acme/b",
  number: 2,
  failingChecks: 1,
  pendingChecks: 0,
  failing: ["build"],
  pending: [],
  checkNames: ["build"],
  isDraft: false,
  blocked: false,
  readyViaBlocked: false,
  reviewDecision: "",
  mergeState: "",
  stuckSince: "2026-06-20T00:00:00Z",
};

const DRAFT_STUCK_PR = { ...STUCK_PR, id: "draft-stuck", title: "draft stuck pr", isDraft: true };

const REVIEW_PR = {
  id: "9",
  title: "review pr",
  url: "u",
  repo: "acme/c",
  number: 9,
  author: "alice",
  isDraft: false,
  requestedAt: "2026-06-22T00:00:00Z",
};

const DRAFT_REVIEW_PR = { ...REVIEW_PR, id: "draft-review", title: "draft review pr", isDraft: true };

const READY_PR = {
  id: "r1",
  title: "ready pr",
  url: "u",
  repo: "acme/d",
  number: 5,
  readySince: "2026-06-21T00:00:00Z",
  needsUpdate: false,
};

const ORGS = [
  { login: "acme", avatarUrl: "a" },
  { login: "beta", avatarUrl: "b" },
];

// An unanswered review-thread comment on STUCK_PR (prId matches STUCK_PR.id).
const COMMENT = {
  id: "t1",
  prId: "2",
  url: "https://github.com/acme/b/pull/2#discussion_r1",
  repo: "acme/b",
  number: 2,
  author: "alice",
  isBot: false,
  path: "src/app.ts",
  source: "thread",
  preview: "please fix the null check",
  commentedAt: "2026-06-19T00:00:00Z",
  viewerReacted: false,
};

// The other comment surface: a question typed into the review box, which hangs
// on the PR rather than on a file.
const REVIEW_COMMENT = {
  ...COMMENT,
  id: "rv1",
  url: "https://github.com/acme/b/pull/2#pullrequestreview-1",
  path: "",
  source: "review",
  preview: "does this handle the empty case?",
};

// A comment the viewer acknowledged with an emoji reaction (on STUCK_PR).
const REACTED_COMMENT = {
  ...COMMENT,
  id: "t4",
  url: "https://github.com/acme/b/pull/2#discussion_r4",
  preview: "reacted with a thumbs up",
  viewerReacted: true,
};

const BOT_COMMENT = {
  ...COMMENT,
  id: "t2",
  url: "https://github.com/acme/b/pull/2#discussion_r2",
  author: "github-actions",
  isBot: true,
  preview: "bot says something",
};

// A comment on a PR that is in neither the stuck nor the ready list.
const ORPHAN_COMMENT = {
  ...COMMENT,
  id: "t3",
  prId: "not-visible",
  preview: "comment on an invisible pr",
};

function okFetch() {
  // SIX-WAY: reviewed-prs → [], closed-prs → [], pr-comments → [], ready → [READY_PR],
  // stuck → [STUCK_PR], else (review-requests) → [REVIEW_PR]. "reviewed" is tested
  // first because "/api/reviewed-prs" also contains "review".
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      headers: { get: () => null },
      json: () =>
        Promise.resolve(
          url.includes("reviewed")
            ? []
            : url.includes("closed")
            ? []
            : url.includes("pr-comments")
              ? []
              : url.includes("ready")
                ? [READY_PR]
                : url.includes("stuck")
                  ? [STUCK_PR]
                  : [REVIEW_PR],
        ),
    }),
  ) as unknown as typeof fetch;
}

// Serves the four lists, with the comments list supplied per test.
function fetchWithComments(comments: unknown[]) {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      headers: { get: () => null },
      json: () =>
        Promise.resolve(
          url.includes("reviewed")
            ? []
            : url.includes("closed")
            ? []
            : url.includes("pr-comments")
              ? comments
              : url.includes("ready")
                ? []
                : url.includes("stuck")
                  ? [STUCK_PR]
                  : [],
        ),
    }),
  ) as unknown as typeof fetch;
}

function partialFetch() {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      headers: { get: (h: string) => (url.includes("stuck") && h === "X-Partial" ? "1" : null) },
      json: () =>
        Promise.resolve(
          url.includes("reviewed")
            ? []
            : url.includes("closed")
            ? []
            : url.includes("ready") ? [READY_PR] : url.includes("stuck") ? [STUCK_PR] : [REVIEW_PR],
        ),
    }),
  ) as unknown as typeof fetch;
}

// N closed PRs, newest-close first (endedAt decreases as the index grows), so
// sortByAgeDesc keeps "closed pr 0" at the top.
function makeClosed(n: number) {
  const base = Date.UTC(2026, 5, 25, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    title: `closed pr ${i}`,
    url: `https://github.com/acme/b/pull/${100 + i}`,
    number: 100 + i,
    repo: "acme/b",
    merged: i % 2 === 0,
    endedAt: new Date(base - i * 86_400_000).toISOString(),
  }));
}

// Serves the closed list on /api/closed-prs; the other four lists stay empty
// except stuck, so unrelated sections don't interfere.
function fetchWithClosed(closed: unknown[]) {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      headers: { get: () => null },
      json: () =>
        Promise.resolve(
          url.includes("reviewed")
            ? []
            : url.includes("closed")
            ? closed
            : url.includes("stuck")
              ? [STUCK_PR]
              : [],
        ),
    }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = okFetch();
});

/** Comment filters, auto refresh, and tracked checks live in the Settings
 * modal; open it first, then pick the section under test. */
function openSettings(section?: string) {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  if (section) fireEvent.click(screen.getByRole("tab", { name: section }));
}

describe("Dashboard", () => {
  it("loads both lists across all orgs on mount (no org scope)", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(screen.getByText("review pr")).toBeInTheDocument();
    // Default selection is "All", so requests carry no org param.
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.every((c) => !String(c[0]).includes("org="))).toBe(true);
    expect(localStorage.getItem("prison.org")).toBe("");
  });

  it("scopes the fetch and persists when an org is selected", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "beta" } });
    await waitFor(() =>
      expect(localStorage.getItem("prison.org")).toBe("beta"),
    );
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some((c) => String(c[0]).includes("org=beta"))).toBe(true);
  });

  it("hydrates the persisted org from localStorage", async () => {
    localStorage.setItem("prison.org", "beta");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c) => String(c[0]).includes("org=beta"))).toBe(true);
    });
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("beta");
  });

  it("shows an error banner and retry when the stuck fetch fails", async () => {
    global.fetch = vi.fn((url: string) =>
      url.includes("stuck")
        ? Promise.reject(new Error("network error"))
        : url.includes("ready")
          ? Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
          : Promise.resolve({ ok: true, json: () => Promise.resolve([REVIEW_PR]) }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("review pr")).toBeInTheDocument();
    expect(screen.getByText(/failed to load stuck prs/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows an error banner on a non-ok stuck response", async () => {
    global.fetch = vi.fn((url: string) =>
      url.includes("stuck")
        ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve([]) })
        : url.includes("ready")
          ? Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
          : Promise.resolve({ ok: true, json: () => Promise.resolve([REVIEW_PR]) }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(/failed to load stuck prs/i)).toBeInTheDocument();
  });

  it("shows an error banner when the review fetch fails", async () => {
    global.fetch = vi.fn((url: string) =>
      url.includes("ready")
        ? Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
        : url.includes("review")
          ? Promise.reject(new Error("network error"))
          : Promise.resolve({ ok: true, json: () => Promise.resolve([STUCK_PR]) }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(screen.getByText(/failed to load review requests/i)).toBeInTheDocument();
  });

  it("recovers when retry is clicked after an error", async () => {
    let fail = true;
    global.fetch = vi.fn((url: string) => {
      if (url.includes("ready")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes("stuck")) {
        return fail
          ? Promise.reject(new Error("network error"))
          : Promise.resolve({ ok: true, json: () => Promise.resolve([STUCK_PR]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([REVIEW_PR]) });
    }) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    const retry = await screen.findByRole("button", { name: /retry/i });
    fail = false;
    fireEvent.click(retry);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(screen.queryByText(/failed to load stuck prs/i)).not.toBeInTheDocument();
  });

  it("shows the loading indicator while a fetch is in flight", async () => {
    let resolveStuck!: (v: unknown) => void;
    global.fetch = vi.fn((url: string) =>
      url.includes("stuck")
        ? new Promise((res) => {
            resolveStuck = res;
          })
        : url.includes("ready")
          ? Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
          : Promise.resolve({ ok: true, json: () => Promise.resolve([REVIEW_PR]) }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
    resolveStuck({ ok: true, json: () => Promise.resolve([STUCK_PR]) });
    await waitFor(() =>
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
    );
  });

  it("discards a stale in-flight response when the filter changes mid-flight", async () => {
    const resolvers: Record<string, () => void> = {};
    global.fetch = vi.fn((url: string) => {
      const key = new URL(url, "http://x").searchParams.get("org") ?? "all";
      if (url.includes("stuck")) {
        return new Promise((resolve) => {
          resolvers[key] = () =>
            resolve({
              ok: true,
              json: () =>
                Promise.resolve([{ ...STUCK_PR, id: key, title: `stuck-${key}` }]),
            });
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }) as unknown as typeof fetch;

    render(<Dashboard orgs={ORGS} login="testuser" />);
    // The "All" stuck fetch is in flight; switch to beta before it resolves.
    await waitFor(() => expect(resolvers["all"]).toBeDefined());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "beta" } });
    await waitFor(() => expect(resolvers["beta"]).toBeDefined());

    resolvers["beta"]();
    expect(await screen.findByText("stuck-beta")).toBeInTheDocument();
    // The stale "All" response now resolves and must be ignored.
    resolvers["all"]();
    expect(await screen.findByText("stuck-beta")).toBeInTheDocument();
    expect(screen.queryByText("stuck-all")).not.toBeInTheDocument();
  });

  it("selecting the personal option fetches with ?user= and persists", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "testuser" } });
    await waitFor(() =>
      expect(localStorage.getItem("prison.org")).toBe("testuser"),
    );
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    // Some call after the change must use user=testuser
    expect(calls.some((c) => String(c[0]).includes("user=testuser"))).toBe(true);
    // No call that includes "testuser" should use org= (must use user=)
    expect(
      calls.every((c) => !String(c[0]).includes("org=testuser")),
    ).toBe(true);
  });

  it("hydrates the persisted personal selection", async () => {
    localStorage.setItem("prison.org", "testuser");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c) => String(c[0]).includes("user=testuser"))).toBe(true);
    });
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("testuser");
  });

  it("encodes the org name in the request URLs", async () => {
    render(<Dashboard orgs={[{ login: "a b", avatarUrl: "x" }]} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "a b" } });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c) => String(c[0]).includes("org=a%20b"))).toBe(true);
    });
  });

  it("shows a failing check name in the stuck detail", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("build")).toBeInTheDocument();
  });

  it("shows a pending check name in the stuck detail", async () => {
    const PENDING_PR = {
      ...STUCK_PR,
      id: "pending",
      failing: [],
      pending: ["lint"],
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [PENDING_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("lint")).toBeInTheDocument();
  });

  it("truncates to 4 named checks and shows a +N more overflow", async () => {
    const MANY_PR = {
      ...STUCK_PR,
      id: "many",
      failing: ["f1", "f2", "f3"],
      pending: ["p1", "p2", "p3"],
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [MANY_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("f1")).toBeInTheDocument();
    // First 2 failing + first 2 pending shown; the rest collapse into overflow.
    expect(screen.getByText("f2")).toBeInTheDocument();
    expect(screen.getByText("p1")).toBeInTheDocument();
    expect(screen.getByText("p2")).toBeInTheDocument();
    expect(screen.queryByText("f3")).not.toBeInTheDocument();
    expect(screen.queryByText("p3")).not.toBeInTheDocument();
    // 6 total names - 4 shown = +2 more
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("shows all names without overflow when there are exactly 4", async () => {
    const FOUR_FAILING_PR = {
      ...STUCK_PR,
      id: "four",
      failing: ["f1", "f2", "f3", "f4"],
      pending: [],
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [FOUR_FAILING_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("f1")).toBeInTheDocument();
    // 4 total (not > 4): every name is shown, no truncation, no overflow chip.
    expect(screen.getByText("f2")).toBeInTheDocument();
    expect(screen.getByText("f3")).toBeInTheDocument();
    expect(screen.getByText("f4")).toBeInTheDocument();
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("derives the overflow count from rendered chips for a lopsided list", async () => {
    const LOPSIDED_PR = {
      ...STUCK_PR,
      id: "lopsided",
      failing: ["f1", "f2", "f3", "f4", "f5"],
      pending: [],
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [LOPSIDED_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("f1")).toBeInTheDocument();
    // 5 total (> 4): only 2 failing chips render (no pending to fill the other
    // 2 slots), so 3 are hidden — the overflow must reflect that, not 5 - 4.
    expect(screen.getByText("f2")).toBeInTheDocument();
    expect(screen.queryByText("f3")).not.toBeInTheDocument();
    expect(screen.getByText("+3 more")).toBeInTheDocument();
  });

  it("falls back to the count string when there are no named checks", async () => {
    const NO_NAMES_PR = {
      ...STUCK_PR,
      id: "no-names",
      failingChecks: 3,
      pendingChecks: 2,
      failing: [],
      pending: [],
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [NO_NAMES_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("3 failing · 2 pending")).toBeInTheDocument();
  });

  it("blocked-no-checks PR shows the inline note detail", async () => {
    const BLOCKED_NO_CHECKS_PR = {
      ...STUCK_PR,
      id: "blocked-no-checks",
      failingChecks: 0,
      pendingChecks: 0,
      failing: [],
      pending: [],
      blocked: true,
      mergeState: "BLOCKED",
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [BLOCKED_NO_CHECKS_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("Some required checks run on GitHub and aren't shown here.")).toBeInTheDocument();
    // The blocked PR still appears in the list (its title row is rendered)
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
  });

  it("review-required PR shows a 'Review required' chip instead of the generic note", async () => {
    const REVIEW_REQUIRED_PR = {
      ...STUCK_PR,
      id: "review-required",
      title: "review required pr",
      failingChecks: 0,
      pendingChecks: 0,
      failing: [],
      pending: [],
      checkNames: [],
      blocked: true,
      mergeState: "BLOCKED",
      reviewDecision: "REVIEW_REQUIRED",
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [REVIEW_REQUIRED_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("Review required")).toBeInTheDocument();
    // The misleading "required checks" note must NOT be shown — the blocker is review, not CI.
    expect(
      screen.queryByText("Some required checks run on GitHub and aren't shown here."),
    ).not.toBeInTheDocument();
  });

  it("changes-requested PR shows a 'Changes requested' chip", async () => {
    const CHANGES_REQUESTED_PR = {
      ...STUCK_PR,
      id: "changes-requested",
      title: "changes requested pr",
      failingChecks: 0,
      pendingChecks: 0,
      failing: [],
      pending: [],
      checkNames: [],
      blocked: true,
      mergeState: "BLOCKED",
      reviewDecision: "CHANGES_REQUESTED",
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [CHANGES_REQUESTED_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("Changes requested")).toBeInTheDocument();
    expect(screen.queryByText("Review required")).not.toBeInTheDocument();
  });

  it("DIRTY + review-required PR shows the conflict chip alongside the review chip", async () => {
    const DIRTY_REVIEW_PR = {
      ...STUCK_PR,
      id: "dirty-review",
      title: "dirty review pr",
      failingChecks: 0,
      pendingChecks: 0,
      failing: [],
      pending: [],
      checkNames: [],
      blocked: true,
      mergeState: "DIRTY",
      reviewDecision: "REVIEW_REQUIRED",
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [DIRTY_REVIEW_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    // Both are true and both are actionable; the old note replaced the review
    // chip outright, which hid one blocker to show the other.
    expect(await screen.findByText("Merge conflict")).toBeInTheDocument();
    expect(screen.getByText("Review required")).toBeInTheDocument();
  });

  it("blocked PR with visible check names shows chips and not the note", async () => {
    const BLOCKED_WITH_CHECKS_PR = {
      ...STUCK_PR,
      id: "blocked-with-checks",
      title: "blocked with checks pr",
      failingChecks: 1,
      pendingChecks: 0,
      failing: ["ci"],
      pending: [],
      blocked: true,
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [BLOCKED_WITH_CHECKS_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("ci")).toBeInTheDocument();
    expect(
      screen.queryByText("Some required checks run on GitHub and aren't shown here."),
    ).not.toBeInTheDocument();
  });

  it("BEHIND PR in stuck list no longer shows the out-of-date note (BEHIND arm removed)", async () => {
    // BEHIND PRs are no longer returned by parseStuckPrs and the BEHIND arm has
    // been removed from the stuck renderRow ternary. If a BEHIND PR somehow
    // reached the stuck list it would fall through to the blocked note.
    const BEHIND_STUCK_PR = {
      ...STUCK_PR,
      id: "behind",
      failingChecks: 0,
      pendingChecks: 0,
      failing: [],
      pending: [],
      blocked: true,
      mergeState: "BEHIND",
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [BEHIND_STUCK_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    // Out-of-date note is gone — BEHIND arm was removed
    expect(
      screen.queryByText("Out of date with the base branch — update it to merge."),
    ).not.toBeInTheDocument();
    // Falls through to the blocked note
    expect(
      screen.getByText("Some required checks run on GitHub and aren't shown here."),
    ).toBeInTheDocument();
  });

  // The case that made this a bug report: a conflicted PR with one red check
  // showed the check and said nothing about the conflict, because the note was
  // the else-branch of "has no check names".
  it("shows the conflict beside the failing check, not instead of it", async () => {
    const DIRTY_AND_FAILING_PR = {
      ...STUCK_PR,
      id: "dirty-and-failing",
      title: "dirty and failing pr",
      failingChecks: 1,
      pendingChecks: 0,
      failing: ["env_check"],
      pending: [],
      checkNames: ["env_check"],
      blocked: true,
      mergeState: "DIRTY",
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [DIRTY_AND_FAILING_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("Merge conflict")).toBeInTheDocument();
    expect(screen.getByText("env_check")).toBeInTheDocument();
    // And the call to action names the blocker that cannot clear itself.
    expect(screen.getByText("Resolve conflicts")).toBeInTheDocument();
    expect(screen.queryByText("Re-run failed checks")).not.toBeInTheDocument();
  });

  it("DIRTY PR shows the merge-conflict chip", async () => {
    const DIRTY_PR = {
      ...STUCK_PR,
      id: "dirty",
      failingChecks: 0,
      pendingChecks: 0,
      failing: [],
      pending: [],
      blocked: true,
      mergeState: "DIRTY",
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [DIRTY_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("Merge conflict")).toBeInTheDocument();
    expect(
      screen.queryByText("Out of date with the base branch — update it to merge."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Some required checks run on GitHub and aren't shown here."),
    ).not.toBeInTheDocument();
  });

  it("BLOCKED PR still shows the required-checks note", async () => {
    const BLOCKED_PR = {
      ...STUCK_PR,
      id: "blocked-explicit",
      failingChecks: 0,
      pendingChecks: 0,
      failing: [],
      pending: [],
      blocked: true,
      mergeState: "BLOCKED",
    };
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready") ? [] : url.includes("stuck") ? [BLOCKED_PR] : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("Some required checks run on GitHub and aren't shown here.")).toBeInTheDocument();
    expect(
      screen.queryByText("Out of date with the base branch — update it to merge."),
    ).not.toBeInTheDocument();
  });

  // The three states share a board that has one draft and one non-draft in each
  // of the two filtered lists.
  const draftsAndNot = () =>
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("ready")
              ? []
              : url.includes("stuck")
                ? [STUCK_PR, DRAFT_STUCK_PR]
                : [REVIEW_PR, DRAFT_REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;

  const draftButton = (name: RegExp) => screen.getByRole("button", { name });

  it("shows drafts and non-drafts together by default", async () => {
    global.fetch = draftsAndNot();
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("draft stuck pr")).toBeInTheDocument();
    expect(screen.getByText("draft review pr")).toBeInTheDocument();
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
    expect(screen.getByText("review pr")).toBeInTheDocument();
    expect(draftButton(/^all$/i)).toHaveAttribute("aria-pressed", "true");
  });

  it("drops drafts from both lists on No drafts", async () => {
    global.fetch = draftsAndNot();
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("draft stuck pr")).toBeInTheDocument();

    fireEvent.click(draftButton(/no drafts/i));
    expect(draftButton(/no drafts/i)).toHaveAttribute("aria-pressed", "true");
    expect(draftButton(/^all$/i)).toHaveAttribute("aria-pressed", "false");

    await waitFor(() =>
      expect(screen.queryByText("draft stuck pr")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("draft review pr")).not.toBeInTheDocument();
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
    expect(screen.getByText("review pr")).toBeInTheDocument();
  });

  it("keeps only drafts on Only drafts", async () => {
    global.fetch = draftsAndNot();
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    fireEvent.click(draftButton(/only drafts/i));
    expect(draftButton(/only drafts/i)).toHaveAttribute("aria-pressed", "true");

    await waitFor(() =>
      expect(screen.queryByText("stuck pr")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("review pr")).not.toBeInTheDocument();
    expect(screen.getByText("draft stuck pr")).toBeInTheDocument();
    expect(screen.getByText("draft review pr")).toBeInTheDocument();
  });

  it("says why Ready to merge is empty under Only drafts", async () => {
    // parseReadyPrs drops drafts server-side, so that section can only ever be
    // empty in this mode — correctly, but an unexplained blank reads as a bug.
    global.fetch = draftsAndNot();
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("Nothing ready to merge")).toBeInTheDocument();

    fireEvent.click(draftButton(/only drafts/i));
    await waitFor(() =>
      expect(screen.getByText("Drafts are never ready to merge")).toBeInTheDocument(),
    );
  });

  // The tiles count the same visible lists the sections render, so a filter can
  // never leave a tile disagreeing with the list right under it — the one way a
  // summary row is worse than no summary row at all.
  it("counts only what the draft filter leaves visible", async () => {
    global.fetch = draftsAndNot();
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("draft stuck pr")).toBeInTheDocument();

    // The section index repeats these names, so find the tile among the tiles
    // rather than by a page-wide text match.
    const tile = (label: string) =>
      screen
        .getAllByTestId("summary-tile")
        .find((t) => t.textContent?.includes(label)) as HTMLElement;
    expect(tile("Stuck on checks")).toHaveTextContent("2");
    expect(tile("Waiting on you")).toHaveTextContent("2");

    fireEvent.click(draftButton(/no drafts/i));
    await waitFor(() => expect(tile("Stuck on checks")).toHaveTextContent("1"));
    expect(tile("Waiting on you")).toHaveTextContent("1");
  });

  it("persists the draft filter to localStorage", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    fireEvent.click(draftButton(/only drafts/i));
    await waitFor(() =>
      expect(localStorage.getItem("prison.draftFilter")).toBe("only"),
    );
  });

  it("restores the draft filter on mount", async () => {
    localStorage.setItem("prison.draftFilter", "only");
    global.fetch = draftsAndNot();
    render(<Dashboard orgs={ORGS} login="testuser" />);
    // The non-draft is gone from the start — the filter applies before the
    // first paint the user sees, not after a flash of everything.
    expect(await screen.findByText("draft stuck pr")).toBeInTheDocument();
    expect(screen.queryByText("stuck pr")).not.toBeInTheDocument();
    expect(draftButton(/only drafts/i)).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores a draft filter localStorage does not recognise", async () => {
    localStorage.setItem("prison.draftFilter", "sometimes");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(draftButton(/^all$/i)).toHaveAttribute("aria-pressed", "true");
  });

  it("carries the old hide-drafts setting over to No drafts", async () => {
    // The two-state key is what everyone upgrading has; dropping it would
    // silently turn their drafts back on.
    localStorage.setItem("prison.hideDrafts", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(draftButton(/no drafts/i)).toHaveAttribute("aria-pressed", "true");
  });

  it("prefers the new draft filter key over the old one", async () => {
    localStorage.setItem("prison.hideDrafts", "true");
    localStorage.setItem("prison.draftFilter", "all");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(draftButton(/^all$/i)).toHaveAttribute("aria-pressed", "true");
  });

  it("applies the migrated setting to the lists, not just the buttons", async () => {
    localStorage.setItem("prison.hideDrafts", "true");
    global.fetch = draftsAndNot();

    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(screen.queryByText("draft stuck pr")).not.toBeInTheDocument();
    expect(screen.queryByText("draft review pr")).not.toBeInTheDocument();
  });

  describe("prioritize-blocking", () => {
    it("review list renders before the stuck list in the DOM", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      const html = document.body.innerHTML;
      expect(html.indexOf("PRs waiting on your review")).toBeLessThan(
        html.indexOf("PRs stuck on checks"),
      );
    });

    it("review list count badge uses warning style when items are present", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("review pr")).toBeInTheDocument();
      const heading = screen.getByRole("heading", { name: /prs waiting on your review/i });
      const badge = heading.closest("section")?.querySelector('[data-testid="count-badge"]');
      expect(badge).toHaveClass("bg-warning");
    });

    it("review row shows 'Blocking @author' with amber styling", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("review pr")).toBeInTheDocument();
      expect(screen.getByText(/Blocking @alice/)).toBeInTheDocument();
      expect(screen.queryByText(/Requested by/)).not.toBeInTheDocument();
    });

    it("By check button is present in the toggle", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^by check$/i }),
      ).toBeInTheDocument();
    });

    it("By check button toggles groupBy to check and persists", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^by check$/i }));
      expect(
        screen.getByRole("button", { name: /^by check$/i }),
      ).toHaveAttribute("aria-pressed", "true");
      await waitFor(() =>
        expect(localStorage.getItem("prison.groupBy")).toBe("check"),
      );
    });

    it("hydrates old 'blocker' value from localStorage as flat", async () => {
      localStorage.setItem("prison.groupBy", "blocker");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^by check$/i }),
      ).toHaveAttribute("aria-pressed", "false");
    });

    it("By check groups stuck PRs by check name — a PR appears under every blocking check", async () => {
      const PR_X = {
        ...STUCK_PR,
        id: "prx",
        title: "PR-X",
        failing: ["ci"],
        pending: ["lint"],
      };
      const PR_Y = {
        ...STUCK_PR,
        id: "pry",
        title: "PR-Y",
        failing: ["ci"],
        pending: [],
      };
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              url.includes("ready") ? [] : url.includes("stuck") ? [PR_X, PR_Y] : [],
            ),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      fireEvent.click(screen.getByRole("button", { name: /^by check$/i }));
      // ci has 2 PRs, lint has 1 → 2 group headers total
      await waitFor(() =>
        expect(screen.getAllByTestId("group-header")).toHaveLength(2),
      );
      const headers = screen.getAllByTestId("group-header");
      // ci (2 PRs) comes first (count-desc ordering)
      expect(headers[0].textContent).toContain("ci");
      expect(headers[0].textContent).toContain("2");
      // lint (1 PR) comes second
      expect(headers[1].textContent).toContain("lint");
      expect(headers[1].textContent).toContain("1");
      // PR-X appears in both ci and lint groups → title in DOM twice
      expect(screen.getAllByText("PR-X")).toHaveLength(2);
      // PR-Y appears only in ci group → title in DOM once
      expect(screen.getAllByText("PR-Y")).toHaveLength(1);
    });

    it("By check — PRs with no named checks go under Other", async () => {
      const NO_CHECKS_PR = {
        ...STUCK_PR,
        id: "nochex",
        title: "no checks pr",
        failing: [],
        pending: [],
      };
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              url.includes("ready") ? [] : url.includes("stuck") ? [NO_CHECKS_PR] : [],
            ),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      fireEvent.click(screen.getByRole("button", { name: /^by check$/i }));
      expect(await screen.findByTestId("group-header")).toBeInTheDocument();
      expect(screen.getByTestId("group-header").textContent).toContain("Other");
    });

    it("By check — a review-required PR with no failing/pending checks groups under 'Review required', not Other", async () => {
      const REVIEW_PR_X = {
        ...STUCK_PR,
        id: "revx",
        title: "review pr x",
        failing: [],
        pending: [],
        checkNames: [],
        blocked: true,
        mergeState: "BLOCKED",
        reviewDecision: "REVIEW_REQUIRED",
      };
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              url.includes("ready") ? [] : url.includes("stuck") ? [REVIEW_PR_X] : [],
            ),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      fireEvent.click(screen.getByRole("button", { name: /^by check$/i }));
      expect(await screen.findByTestId("group-header")).toBeInTheDocument();
      expect(screen.getByTestId("group-header").textContent).toContain("Review required");
      expect(screen.getByTestId("group-header").textContent).not.toContain("Other");
    });

    it("review list stays flat in By check mode (no group headers in review section)", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("review pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^by check$/i }));
      // STUCK_PR has failing: ["build"] → "build" check → 1 group header
      // Review list is flat in check mode → 0 group headers from review
      // Ready list is always flat → 0 group headers from ready
      await waitFor(() =>
        expect(screen.getAllByTestId("group-header")).toHaveLength(1),
      );
      expect(screen.getByText("review pr")).toBeInTheDocument();
    });

    it("By check — persists 'check' to localStorage", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^by check$/i }));
      await waitFor(() =>
        expect(localStorage.getItem("prison.groupBy")).toBe("check"),
      );
    });

    it("By-repo subheaders are links to the repo on GitHub", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^by repo$/i }));
      await waitFor(() =>
        expect(screen.getAllByTestId("group-header")).toHaveLength(2),
      );
      const link = screen.getByRole("link", { name: /open acme\/b on github/i });
      expect(link).toHaveAttribute("href", "https://github.com/acme/b");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("By check subheaders are NOT links (stay plain text)", async () => {
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              url.includes("ready") ? [] : url.includes("stuck") ? [STUCK_PR] : [],
            ),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      fireEvent.click(screen.getByRole("button", { name: /^by check$/i }));
      // STUCK_PR has failing: ["build"] → a "build" group header appears
      expect(await screen.findByTestId("group-header")).toBeInTheDocument();
      // The group header for "build" should not be a link
      expect(
        screen.queryByRole("link", { name: /build/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("stuck list count badge uses danger style when items are present", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: /prs stuck on checks/i });
    const badge = heading.closest("section")?.querySelector('[data-testid="count-badge"]');
    expect(badge).toHaveClass("bg-danger");
  });

  describe("refresh button", () => {
    it("renders a Refresh button", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^refresh$/i }),
      ).toBeInTheDocument();
    });

    it("re-fetches all lists when Refresh is clicked", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      // Wait for the mount fetches to settle so the button is enabled —
      // clicking while it is still disabled (mount load in flight) is a no-op
      // and races under full-suite concurrency.
      const refreshButton = screen.getByRole("button", { name: /^refresh$/i });
      await waitFor(() => expect(refreshButton).toBeEnabled());
      const before = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
        .length;
      fireEvent.click(refreshButton);
      await waitFor(() => {
        const after = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
          .length;
        // One refresh = stuck-prs + review-requests + ready-to-merge + pr-comments
        // + closed-prs + reviewed-prs.
        expect(after).toBe(before + 6);
      });
    });

    it("disables the Refresh button while a click-triggered fetch is in flight, then re-enables it", async () => {
      // First stuck fetch (mount load) resolves immediately so the button
      // settles to enabled; the second one (the Refresh click) hangs so we can
      // observe the disabled state for the click path itself, not just mount.
      let stuckPass = 0;
      let resolveStuck!: (v: unknown) => void;
      global.fetch = vi.fn((url: string) => {
        if (url.includes("ready")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        if (!url.includes("stuck")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([REVIEW_PR]) });
        }
        stuckPass += 1;
        if (stuckPass === 1) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([STUCK_PR]) });
        }
        return new Promise((res) => {
          resolveStuck = res;
        });
      }) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      // Mount load settles: button is enabled.
      const refresh = await screen.findByRole("button", { name: /^refresh$/i });
      await waitFor(() => expect(refresh).toBeEnabled());
      // Clicking Refresh starts a fetch that stays in flight: button disables.
      fireEvent.click(refresh);
      await waitFor(() => expect(refresh).toBeDisabled());
      // Resolving the click-triggered fetch re-enables the button.
      resolveStuck({ ok: true, json: () => Promise.resolve([STUCK_PR]) });
      await waitFor(() => expect(refresh).toBeEnabled());
    });
  });

  describe("groupBy toggle", () => {
    it("renders both Flat and By repo buttons", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^flat$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^by repo$/i })).toBeInTheDocument();
    });

    it('defaults to Flat: "Flat" is pressed, "By repo" is not', async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^flat$/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: /^by repo$/i })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it('clicking "By repo" sets its aria-pressed to true', async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^by repo$/i }));
      expect(screen.getByRole("button", { name: /^by repo$/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: /^flat$/i })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it('clicking "Flat" after "By repo" switches back', async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^by repo$/i }));
      fireEvent.click(screen.getByRole("button", { name: /^flat$/i }));
      expect(screen.getByRole("button", { name: /^flat$/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: /^by repo$/i })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it('persists "repo" to localStorage when "By repo" is clicked', async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^by repo$/i }));
      await waitFor(() =>
        expect(localStorage.getItem("prison.groupBy")).toBe("repo"),
      );
    });

    it('persists "flat" to localStorage when "Flat" is clicked after "By repo"', async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^by repo$/i }));
      fireEvent.click(screen.getByRole("button", { name: /^flat$/i }));
      await waitFor(() =>
        expect(localStorage.getItem("prison.groupBy")).toBe("flat"),
      );
    });

    it('hydrates "By repo" from localStorage', async () => {
      localStorage.setItem("prison.groupBy", "repo");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^by repo$/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: /^flat$/i })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it('defaults to "Flat" when no localStorage key is present', async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^flat$/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("shows group headers in By repo mode and hides them in Flat mode", async () => {
      const STUCK_PR_B = {
        ...STUCK_PR,
        id: "stuck-b",
        title: "stuck pr b",
        repo: "acme/x",
      };
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              url.includes("ready")
                ? []
                : url.includes("stuck")
                  ? [STUCK_PR, STUCK_PR_B]
                  : [REVIEW_PR],
            ),
        }),
      ) as unknown as typeof fetch;

      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();

      // In Flat mode: no group headers visible
      expect(screen.queryByTestId("group-header")).not.toBeInTheDocument();

      // Switch to By repo
      fireEvent.click(screen.getByRole("button", { name: /^by repo$/i }));

      // Now group headers appear: 2 distinct repos in stuck list + 1 in review list = 3 total
      // Ready list is always flat → contributes 0 group headers
      await waitFor(() =>
        expect(screen.getAllByTestId("group-header")).toHaveLength(3),
      );
    });
  });

  describe("tracked checks", () => {
    it("shows an awaiting chip for a tracked check absent from checkNames", async () => {
      localStorage.setItem(
        "prison.trackedChecks",
        JSON.stringify({ orgs: { acme: ["qa/smoke"] }, repos: {} }),
      );
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      // Chip renders the name as text content and carries an accessible label
      expect(screen.getByText("qa/smoke")).toBeInTheDocument();
      expect(screen.getByLabelText("Awaiting required check: qa/smoke")).toBeInTheDocument();
    });

    it("does NOT show an awaiting chip when the tracked check is present in checkNames", async () => {
      localStorage.setItem(
        "prison.trackedChecks",
        JSON.stringify({ orgs: { acme: ["build"] }, repos: {} }),
      );
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      // No visible "Awaiting:" label and no accessible awaiting chip
      expect(screen.queryByText("Awaiting:")).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^Awaiting:/)).not.toBeInTheDocument();
    });

    // The dashed chip means "PRison does not know whether this blocks the
    // merge". Once the user has said so, it should stop hedging.
    it("says of an awaiting check whether the user marked it required", async () => {
      localStorage.setItem(
        "prison.trackedChecks",
        JSON.stringify({
          orgs: {
            acme: [
              { name: "qa/smoke", required: true },
              { name: "nightly-e2e", required: false },
            ],
          },
          repos: {},
        }),
      );
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(screen.getByLabelText("Awaiting required check: qa/smoke")).toBeInTheDocument();
      expect(screen.getByLabelText("Awaiting: nightly-e2e")).toBeInTheDocument();
    });

    // A check that cannot block the merge must not act like one.
    it("does not hold a PR out of Ready for a check marked not required", async () => {
      localStorage.setItem(
        "prison.trackedChecks",
        JSON.stringify({ orgs: { acme: [{ name: "nightly-e2e", required: false }] }, repos: {} }),
      );
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          headers: { get: () => null },
          json: () =>
            Promise.resolve(
              url.includes("ready")
                ? [{ ...READY_PR, viaBlocked: true, checkNames: ["build"] }]
                : url.includes("stuck") || url.includes("reviewed") || url.includes("closed") || url.includes("pr-comments")
                  ? []
                  : [REVIEW_PR],
            ),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      // In Ready to merge, not held back in Stuck on checks.
      const ready = await screen.findByText("ready pr");
      expect(ready.closest("section")?.id).toBe("ready-to-merge");
    });

    // The same knowledge applied to a check GitHub did report: a red job that
    // cannot block the merge should not read like one that can.
    it("marks a reported check the user said is not required", async () => {
      localStorage.setItem(
        "prison.trackedChecks",
        JSON.stringify({ orgs: { acme: [{ name: "build", required: false }] }, repos: {} }),
      );
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(screen.getByLabelText("build — not required")).toBeInTheDocument();
    });

  });

  describe("ignored checks", () => {
    const ignore = (repo: string, ...names: string[]) =>
      localStorage.setItem("prison.ignoredChecks", JSON.stringify({ orgs: {}, repos: { [repo]: names } }));

    const sectionOf = (name: RegExp) =>
      screen.getByRole("heading", { name }).closest("section")!;

    // The user's own words: a check they threw out should still be on the card,
    // just not shouting in red.
    it("draws an ignored check muted rather than red", async () => {
      ignore("acme/b", "build");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "build — ignored" })).toBeInTheDocument();
    });

    // And the point of saying a check is broken: it stops holding the PR.
    it("moves the PR to Ready to merge when its only red check is ignored", async () => {
      ignore("acme/b", "build");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      const pr = await screen.findByText("stuck pr");
      expect(pr.closest("section")?.id).toBe("ready-to-merge");
      expect(within(sectionOf(/stuck on checks/i)).queryByText("stuck pr")).not.toBeInTheDocument();
    });

    it("still names the ignored check on the ready card", async () => {
      ignore("acme/b", "build");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(
        within(sectionOf(/ready to merge/i)).getByRole("button", { name: "build — ignored" }),
      ).toBeInTheDocument();
    });

    // The state GitHub puts a PR in when a REQUIRED check is red — the one
    // that made the user call the check broken in the first place.
    it("promotes a PR GitHub reports as BLOCKED over the ignored check", async () => {
      ignore("acme/b", "build");
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          headers: { get: () => null },
          json: () =>
            Promise.resolve(
              url.includes("stuck")
                ? [{ ...STUCK_PR, blocked: true, mergeState: "BLOCKED", reviewDecision: "APPROVED" }]
                : [],
            ),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      const pr = await screen.findByText("stuck pr");
      expect(pr.closest("section")?.id).toBe("ready-to-merge");
    });

    it("keeps the PR stuck while a check nobody ignored is still red", async () => {
      ignore("acme/b", "lint");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      const pr = await screen.findByText("stuck pr");
      expect(pr.closest("section")?.id).toBe("stuck-on-checks");
    });

    it("ignores a check from its chip menu and remembers it", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "build" }));
      fireEvent.click(screen.getByRole("menuitem", { name: /ignore this check/i }));
      expect(JSON.parse(localStorage.getItem("prison.ignoredChecks")!)).toEqual({
        orgs: {},
        repos: { "acme/b": ["build"] },
      });
      expect(screen.getByText("stuck pr").closest("section")?.id).toBe("ready-to-merge");
    });

    it("takes it back from the same menu", async () => {
      ignore("acme/b", "build");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "build — ignored" }));
      fireEvent.click(screen.getByRole("menuitem", { name: /stop ignoring/i }));
      expect(screen.getByText("stuck pr").closest("section")?.id).toBe("stuck-on-checks");
      expect(screen.getByRole("button", { name: "build" })).toBeInTheDocument();
    });

    // A tracked check is a name PRison waits for. Ignoring it is saying the
    // wait was pointless, so the chip that announces the wait has to go too.
    // The ready card carries the same menu, so the decision can be undone
    // where its consequence is visible.
    it("takes it back from the ready card, sending the PR home", async () => {
      ignore("acme/b", "build");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      const card = within(sectionOf(/ready to merge/i));
      fireEvent.click(card.getByRole("button", { name: "build — ignored" }));
      fireEvent.click(screen.getByRole("menuitem", { name: /stop ignoring/i }));
      expect(screen.getByText("stuck pr").closest("section")?.id).toBe("stuck-on-checks");
    });

    it("never awaits a tracked check that was ignored", async () => {
      localStorage.setItem(
        "prison.trackedChecks",
        JSON.stringify({ orgs: { acme: ["qa/smoke"] }, repos: {} }),
      );
      ignore("acme/b", "qa/smoke");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(screen.queryByText("qa/smoke")).not.toBeInTheDocument();
    });

    // A tracked check can turn out to be the broken one, and the awaiting chip
    // is the only place it is ever drawn.
    it("ignores an awaited tracked check from its own chip", async () => {
      localStorage.setItem(
        "prison.trackedChecks",
        JSON.stringify({ orgs: { acme: ["qa/smoke"] }, repos: {} }),
      );
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Awaiting required check: qa/smoke" }));
      fireEvent.click(screen.getByRole("menuitem", { name: /ignore this check/i }));
      expect(screen.queryByText("qa/smoke")).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem("prison.ignoredChecks")!).repos["acme/b"]).toEqual([
        "qa/smoke",
      ]);
    });

    // Regression net around promotion: the stuck payload and the ready payload
    // can carry the same PR, the counts above the board are derived from the
    // visible lists, and a draft must never be called ready.
    it("never promotes a draft, however green ignoring makes it look", async () => {
      ignore("acme/b", "build");
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          headers: { get: () => null },
          json: () => Promise.resolve(url.includes("stuck") ? [DRAFT_STUCK_PR] : []),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      const pr = await screen.findByText("draft stuck pr");
      expect(pr.closest("section")?.id).toBe("stuck-on-checks");
    });

    it("shows a promoted PR once, even when the ready payload names it too", async () => {
      ignore("acme/b", "build");
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          headers: { get: () => null },
          json: () =>
            Promise.resolve(
              url.includes("ready")
                ? [{ id: STUCK_PR.id, title: "stuck pr", url: "u", repo: "acme/b", number: 2, readySince: STUCK_PR.stuckSince, needsUpdate: false, checkNames: ["build"], viaBlocked: true }]
                : url.includes("stuck")
                  ? [{ ...STUCK_PR, blocked: true, readyViaBlocked: true, reviewDecision: "APPROVED" }]
                  : [],
            ),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findAllByText("stuck pr")).toHaveLength(1);
    });

    it("moves the count with the PR", async () => {
      ignore("acme/b", "build");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      // READY_PR plus the promoted one; nothing left stuck.
      expect(within(sectionOf(/ready to merge/i)).getByTestId("count-badge")).toHaveTextContent("2");
      expect(within(sectionOf(/stuck on checks/i)).getByTestId("count-badge")).toHaveTextContent("0");
    });

    it("keeps a promoted PR findable by the name of the check that was ignored", async () => {
      ignore("acme/b", "build");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "build" } });
      expect(screen.getByText("stuck pr")).toBeInTheDocument();
    });

    it("promotes a PR whose checks are merely still running", async () => {
      ignore("acme/b", "e2e");
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          headers: { get: () => null },
          json: () =>
            Promise.resolve(
              url.includes("stuck")
                ? [{ ...STUCK_PR, failingChecks: 0, pendingChecks: 1, failing: [], pending: ["e2e"], checkNames: ["e2e"] }]
                : [],
            ),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      const pr = await screen.findByText("stuck pr");
      expect(pr.closest("section")?.id).toBe("ready-to-merge");
    });

    it("leaves the other repo's PR where it was", async () => {
      ignore("acme/web", "build");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      const pr = await screen.findByText("stuck pr");
      expect(pr.closest("section")?.id).toBe("stuck-on-checks");
      expect(screen.getByRole("button", { name: "build" })).toBeInTheDocument();
    });

    it("applies an owner-wide ignore to every repo under it", async () => {
      localStorage.setItem(
        "prison.ignoredChecks",
        JSON.stringify({ orgs: { acme: ["build"] }, repos: {} }),
      );
      render(<Dashboard orgs={ORGS} login="testuser" />);
      const pr = await screen.findByText("stuck pr");
      expect(pr.closest("section")?.id).toBe("ready-to-merge");
    });

    it("survives a hand-edited ignore list", async () => {
      localStorage.setItem("prison.ignoredChecks", '{"repos":{"acme/b":[7,null,"build"]}}');
      render(<Dashboard orgs={ORGS} login="testuser" />);
      const pr = await screen.findByText("stuck pr");
      expect(pr.closest("section")?.id).toBe("ready-to-merge");
    });

    it("shrugs off a stored value that is not a config at all", async () => {
      localStorage.setItem("prison.ignoredChecks", "not json");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      const pr = await screen.findByText("stuck pr");
      expect(pr.closest("section")?.id).toBe("stuck-on-checks");
    });

    it("still awaits the tracked checks that were not ignored", async () => {
      localStorage.setItem(
        "prison.trackedChecks",
        JSON.stringify({ orgs: { acme: ["qa/smoke", "manual-signoff"] }, repos: {} }),
      );
      ignore("acme/b", "qa/smoke");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(screen.getByLabelText("Awaiting required check: manual-signoff")).toBeInTheDocument();
      expect(screen.queryByText("qa/smoke")).not.toBeInTheDocument();
    });

    // An awaited check holds the PR out of Ready; ignoring it has to let go of
    // that hold as well as of the chip.
    it("stops an ignored tracked check from holding a green PR back", async () => {
      localStorage.setItem(
        "prison.trackedChecks",
        JSON.stringify({ orgs: { acme: ["qa/smoke"] }, repos: {} }),
      );
      localStorage.setItem(
        "prison.ignoredChecks",
        JSON.stringify({ orgs: { acme: ["qa/smoke"] }, repos: {} }),
      );
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          headers: { get: () => null },
          json: () =>
            Promise.resolve(
              url.includes("ready")
                ? [{ ...READY_PR, repo: "acme/b", viaBlocked: true, checkNames: ["build"] }]
                : [],
            ),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      const pr = await screen.findByText("ready pr");
      expect(pr.closest("section")?.id).toBe("ready-to-merge");
    });

    it("ignoring and taking it back leaves the board as it was", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "build" }));
      fireEvent.click(screen.getByRole("menuitem", { name: /ignore this check/i }));
      fireEvent.click(screen.getByRole("button", { name: "build — ignored" }));
      fireEvent.click(screen.getByRole("menuitem", { name: /stop ignoring/i }));
      expect(screen.getByText("stuck pr").closest("section")?.id).toBe("stuck-on-checks");
      expect(JSON.parse(localStorage.getItem("prison.ignoredChecks")!)).toEqual({
        orgs: {},
        repos: {},
      });
    });

    it("hydrates the ignored list from localStorage and persists it back", async () => {
      ignore("acme/b", "build");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem("prison.ignoredChecks")!).repos["acme/b"]).toEqual([
        "build",
      ]);
    });
  });

  describe("tracked checks, continued", () => {
    it("opening settings via gear button renders the tracked checks panel", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      expect(screen.getByText("Tracked checks")).toBeInTheDocument();
    });

    it("closing the settings panel via its close button hides it", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      expect(screen.getByText("Tracked checks")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
      expect(screen.queryByText("Tracked checks")).not.toBeInTheDocument();
    });

    it("hydrates tracked config from localStorage and persists it back", async () => {
      localStorage.setItem(
        "prison.trackedChecks",
        JSON.stringify({ orgs: { acme: ["qa/smoke"] }, repos: {} }),
      );
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      const stored = localStorage.getItem("prison.trackedChecks");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.orgs.acme).toContain("qa/smoke");
    });

    it("passes distinct repos from loaded PR lists as suggestions to the settings modal", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      // STUCK_PR.repo = "acme/b", REVIEW_PR.repo = "acme/c", READY_PR.repo = "acme/d"
      openSettings("Tracked checks");
      const addButton = screen.getByRole("button", { name: /add override/i });
      expect(addButton).toBeInTheDocument();
      fireEvent.click(addButton);
      // Focus the combobox; empty input shows availableRepos as suggestions
      const combobox = screen.getByRole("combobox", { name: "Repository" });
      fireEvent.focus(combobox);
      expect(screen.getByRole("option", { name: "acme/b" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "acme/c" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "acme/d" })).toBeInTheDocument();
    });

    describe("inline awaiting chips", () => {
      it("stuck PR with a failing check and a tracked awaiting check shows both chips inline and no generic note", async () => {
        localStorage.setItem(
          "prison.trackedChecks",
          JSON.stringify({ orgs: { acme: ["Automation Result"] }, repos: {} }),
        );
        // STUCK_PR has repo "acme/b", failing: ["build"], checkNames: ["build"]
        // awaitingChecks("acme/b", ["build"], ...) = ["Automation Result"]
        render(<Dashboard orgs={ORGS} login="testuser" />);
        expect(await screen.findByText("build")).toBeInTheDocument();
        expect(screen.getByText("Automation Result")).toBeInTheDocument();
        expect(
          screen.queryByText("Some required checks run on GitHub and aren't shown here."),
        ).not.toBeInTheDocument();
      });

      it("blocked PR with no failing/pending but an awaiting check shows the awaiting chip and no generic note", async () => {
        const BLOCKED_AWAITING_PR = {
          ...STUCK_PR,
          id: "blocked-awaiting",
          title: "blocked awaiting pr",
          failingChecks: 0,
          pendingChecks: 0,
          failing: [],
          pending: [],
          checkNames: [],
          blocked: true,
          mergeState: "BLOCKED",
        };
        localStorage.setItem(
          "prison.trackedChecks",
          JSON.stringify({ orgs: { acme: ["ci/required"] }, repos: {} }),
        );
        global.fetch = vi.fn((url: string) =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve(
                url.includes("ready") ? [] : url.includes("stuck") ? [BLOCKED_AWAITING_PR] : [REVIEW_PR],
              ),
          }),
        ) as unknown as typeof fetch;
        render(<Dashboard orgs={ORGS} login="testuser" />);
        expect(await screen.findByText("ci/required")).toBeInTheDocument();
        expect(
          screen.queryByText("Some required checks run on GitHub and aren't shown here."),
        ).not.toBeInTheDocument();
      });
    });

    describe("blocked-awaiting bucketing (regression guard)", () => {
      // PR-A: tracked checks ARE present → ready list; PR-B: checks ABSENT → stuck list.
      // Before the fix, PR-B appeared in ready (wrongly). This test fails on old code
      // and passes after the symmetric client-side arbitration is in place.
      it("PR-A (tracked checks present) → ready only; PR-B (checks absent) → stuck only with awaiting chip", async () => {
        localStorage.setItem(
          "prison.trackedChecks",
          JSON.stringify({ orgs: { acme: ["qa/smoke", "Automation Result"] }, repos: {} }),
        );

        // PR-A: BLOCKED+approved+green, rollup includes both tracked names → ready
        const PR_A_READY = {
          id: "a1",
          title: "PR A ready-via-blocked",
          url: "https://github.com/acme/repo/pull/101",
          repo: "acme/repo",
          number: 101,
          readySince: "2026-06-25T00:00:00Z",
          needsUpdate: true,
          checkNames: ["qa/smoke", "Automation Result"],
          viaBlocked: true,
        };

        // PR-B: BLOCKED+approved+green, rollup does NOT include tracked names → stuck
        const PR_B_READY = {
          id: "b1",
          title: "PR B awaiting-via-blocked",
          url: "https://github.com/acme/repo/pull/102",
          repo: "acme/repo",
          number: 102,
          readySince: "2026-06-25T00:00:00Z",
          needsUpdate: true,
          checkNames: [],  // tracked checks not reported yet
          viaBlocked: true,
        };
        const PR_B_STUCK = {
          id: "b1",
          title: "PR B awaiting-via-blocked",
          url: "https://github.com/acme/repo/pull/102",
          repo: "acme/repo",
          number: 102,
          failingChecks: 0,
          pendingChecks: 0,
          failing: [],
          pending: [],
          checkNames: [],
          isDraft: false,
          blocked: true,
          readyViaBlocked: true,
          mergeState: "BLOCKED",
          stuckSince: "2026-06-25T00:00:00Z",
        };

        global.fetch = vi.fn((url: string) =>
          Promise.resolve({
            ok: true,
            headers: { get: () => null },
            json: () =>
              Promise.resolve(
                url.includes("ready")
                  ? [PR_A_READY, PR_B_READY]
                  : url.includes("stuck")
                    ? [PR_B_STUCK]
                    : [],
              ),
          }),
        ) as unknown as typeof fetch;

        render(<Dashboard orgs={ORGS} login="testuser" />);

        // Wait for PR-A to appear in the ready section
        expect(await screen.findByText("PR A ready-via-blocked")).toBeInTheDocument();

        // PR-B should be in the stuck section (awaiting chips visible)
        expect(screen.getByText("PR B awaiting-via-blocked")).toBeInTheDocument();
        expect(screen.getByText("qa/smoke")).toBeInTheDocument();

        // Verify sections: use section elements wrapping each PrList
        const readySection = screen.getByRole("heading", { name: /ready to merge/i }).closest("section")!;
        const stuckSection = screen.getByRole("heading", { name: /PRs stuck on checks/i }).closest("section")!;

        // PR-A in ready, NOT in stuck
        expect(within(readySection).getByText("PR A ready-via-blocked")).toBeInTheDocument();
        expect(within(stuckSection).queryByText("PR A ready-via-blocked")).not.toBeInTheDocument();

        // PR-B in stuck, NOT in ready
        expect(within(stuckSection).getByText("PR B awaiting-via-blocked")).toBeInTheDocument();
        expect(within(readySection).queryByText("PR B awaiting-via-blocked")).not.toBeInTheDocument();
      });
    });
  });

  describe("error banners and retry", () => {
    it("shows an error banner per list on non-ok responses, and each Retry refetches", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({ ok: false, status: 500 }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText(/failed to load stuck prs/i)).toBeInTheDocument();
      expect(screen.getByText(/failed to load review requests/i)).toBeInTheDocument();
      expect(screen.getByText(/failed to load ready-to-merge prs/i)).toBeInTheDocument();
      expect(screen.getByText(/failed to load comments/i)).toBeInTheDocument();
      expect(screen.getByText(/failed to load closed prs/i)).toBeInTheDocument();
      expect(screen.getByText(/failed to load reviewed prs/i)).toBeInTheDocument();

      const before = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
      const retries = screen.getAllByRole("button", { name: /retry/i });
      expect(retries).toHaveLength(6);
      for (const retry of retries) fireEvent.click(retry);
      await waitFor(() =>
        expect(
          (global.fetch as ReturnType<typeof vi.fn>).mock.calls,
        ).toHaveLength(before + 6 * retries.length),
      );
    });

    it("the partial-data notice Retry refetches all lists", async () => {
      global.fetch = partialFetch();
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText(/Some data couldn't be loaded/i)).toBeInTheDocument();
      const notice = screen.getByRole("status");
      fireEvent.click(within(notice).getByRole("button", { name: /retry/i }));
      await waitFor(() =>
        expect(
          (global.fetch as ReturnType<typeof vi.fn>).mock.calls,
        ).toHaveLength(12),
      );
    });
  });

  describe("partial-data notice", () => {
    it("shows the partial-data notice when a list responds with X-Partial", async () => {
      global.fetch = partialFetch();
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText(/Some data couldn't be loaded/i)).toBeInTheDocument();
      // Retry button present and clickable
      const notice = screen.getByRole("status");
      expect(within(notice).getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });

    it("shows no partial-data notice when no list is partial", async () => {
      // okFetch (default from beforeEach) returns X-Partial: null everywhere
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("stuck pr")).toBeInTheDocument();
      expect(screen.queryByText(/Some data couldn't be loaded/i)).not.toBeInTheDocument();
    });
  });

  describe("ready-to-merge", () => {
    it("renders the ready-to-merge list with its fetched items", async () => {
      // beforeEach okFetch returns [READY_PR] for ready endpoints
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("ready pr")).toBeInTheDocument();
      // The section's own header, not the index entry that shares its name.
      expect(
        screen.getByRole("button", { name: /^ready to merge/i }),
      ).toBeInTheDocument();
    });

    it("shows the empty message when nothing is ready", async () => {
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              url.includes("ready")
                ? []
                : url.includes("stuck")
                  ? [STUCK_PR]
                  : [REVIEW_PR],
            ),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("Nothing ready to merge")).toBeInTheDocument();
    });

    it("renders the ready list above the two columns", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("ready pr")).toBeInTheDocument();
      // Compare the sections themselves: the index above names them both, so a
      // text search of the page would only ever measure the index.
      const ready = document.getElementById("ready-to-merge")!;
      const review = document.getElementById("waiting-on-your-review")!;
      expect(
        ready.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("includes ready-to-merge in a Refresh", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("ready pr")).toBeInTheDocument();
      // Wait for the mount fetches to settle so the button is enabled — clicking
      // while it is still disabled (mount load in flight) is a no-op and races
      // under full-suite concurrency.
      const refreshButton = screen.getByRole("button", { name: /^refresh$/i });
      await waitFor(() => expect(refreshButton).toBeEnabled());
      fireEvent.click(refreshButton);
      // 6 fetches on mount + 6 on refresh (stuck + review + ready + comments + closed
      // + reviewed) = 12 total.
      // Use waitFor so the assertion retries until all async refresh fetches register.
      await waitFor(() =>
        expect(global.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(12),
      );
    });

    it("shows a 'Merge on GitHub' link on a ready row", async () => {
      // okFetch returns [READY_PR]; suggestReady returns { text: "Merge on GitHub", href: pr.url }
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("Merge on GitHub")).toBeInTheDocument();
    });

    it("ready list count badge uses success style when items are present", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("ready pr")).toBeInTheDocument();
      const heading = screen.getByRole("heading", { name: /ready to merge/i });
      const badge = heading.closest("section")?.querySelector('[data-testid="count-badge"]');
      expect(badge).toHaveClass("bg-success");
    });

    it("ready PR with needsUpdate shows the 'Needs update' badge", async () => {
      const BEHIND_READY_PR = { ...READY_PR, id: "r-behind", needsUpdate: true };
      global.fetch = vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              url.includes("ready")
                ? [BEHIND_READY_PR]
                : url.includes("stuck")
                  ? [STUCK_PR]
                  : [REVIEW_PR],
            ),
        }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText("Needs update")).toBeInTheDocument();
    });

    it("shows an error banner and retry when the ready fetch fails", async () => {
      global.fetch = vi.fn((url: string) =>
        url.includes("ready")
          ? Promise.reject(new Error("network error"))
          : url.includes("stuck")
            ? Promise.resolve({ ok: true, json: () => Promise.resolve([STUCK_PR]) })
            : Promise.resolve({ ok: true, json: () => Promise.resolve([REVIEW_PR]) }),
      ) as unknown as typeof fetch;
      render(<Dashboard orgs={ORGS} login="testuser" />);
      expect(await screen.findByText(/failed to load ready-to-merge/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });
  });
});

describe("Dashboard — comments awaiting your reply", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = okFetch();
  });

  it("fetches the comments list alongside the other three", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c) => String(c[0]).includes("/api/pr-comments"))).toBe(true);
    });
  });

  it("shows the empty state when nothing awaits a reply", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(
      await screen.findByText(/no comments awaiting your reply/i),
    ).toBeInTheDocument();
  });

  it("renders a comment preview and links straight to the comment anchor", async () => {
    global.fetch = fetchWithComments([COMMENT]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    const link = await screen.findByRole("link", {
      name: /open please fix the null check on github/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/b/pull/2#discussion_r1",
    );
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("Reply to alice")).toBeInTheDocument();
  });

  it("hides comments on PRs that are not visible in the stuck or ready lists", async () => {
    global.fetch = fetchWithComments([ORPHAN_COMMENT]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(screen.queryByText("comment on an invisible pr")).not.toBeInTheDocument();
    expect(screen.getByText(/no comments awaiting your reply/i)).toBeInTheDocument();
  });

  it("says a review-body comment is one, since it carries no file to show instead", async () => {
    global.fetch = fetchWithComments([REVIEW_COMMENT]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("does this handle the empty case?")).toBeInTheDocument();
    expect(screen.getByText("Review comment")).toBeInTheDocument();
    expect(screen.queryByText("src/app.ts")).not.toBeInTheDocument();
  });

  it("labels only the review body when both surfaces are on the board", async () => {
    global.fetch = fetchWithComments([COMMENT, REVIEW_COMMENT]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("please fix the null check")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getAllByText("Review comment")).toHaveLength(1);
  });

  it("hides bot comments by default and reveals them when 'Show bot comments' is checked", async () => {
    global.fetch = fetchWithComments([COMMENT, BOT_COMMENT]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("please fix the null check")).toBeInTheDocument();
    expect(screen.queryByText("bot says something")).not.toBeInTheDocument();

    openSettings();
    fireEvent.click(screen.getByLabelText(/show bot comments/i));
    expect(await screen.findByText("bot says something")).toBeInTheDocument();
  });

  it("persists the 'Show bot comments' toggle to localStorage", async () => {
    global.fetch = fetchWithComments([BOT_COMMENT]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(/no comments awaiting your reply/i)).toBeInTheDocument();
    openSettings();
    fireEvent.click(screen.getByLabelText(/show bot comments/i));
    await waitFor(() =>
      expect(localStorage.getItem("prison.showBots")).toBe("true"),
    );
  });

  it("restores the persisted 'Show bot comments' toggle on mount", async () => {
    localStorage.setItem("prison.showBots", "true");
    global.fetch = fetchWithComments([BOT_COMMENT]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("bot says something")).toBeInTheDocument();
  });

  it("hides comments I reacted to by default and reveals them when the toggle is unchecked", async () => {
    global.fetch = fetchWithComments([COMMENT, REACTED_COMMENT]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("please fix the null check")).toBeInTheDocument();
    expect(screen.queryByText("reacted with a thumbs up")).not.toBeInTheDocument();

    openSettings();
    fireEvent.click(screen.getByLabelText(/hide comments i reacted to/i));
    expect(await screen.findByText("reacted with a thumbs up")).toBeInTheDocument();
  });

  it("persists unchecking 'Hide comments I reacted to' to localStorage", async () => {
    global.fetch = fetchWithComments([REACTED_COMMENT]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(/no comments awaiting your reply/i)).toBeInTheDocument();
    openSettings();
    fireEvent.click(screen.getByLabelText(/hide comments i reacted to/i));
    await waitFor(() =>
      expect(localStorage.getItem("prison.hideReacted")).toBe("false"),
    );
  });

  it("restores the disabled 'Hide comments I reacted to' toggle on mount", async () => {
    localStorage.setItem("prison.hideReacted", "false");
    global.fetch = fetchWithComments([REACTED_COMMENT]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("reacted with a thumbs up")).toBeInTheDocument();
  });

  it("shows an error banner and retry when the comments fetch fails, without breaking the other lists", async () => {
    global.fetch = vi.fn((url: string) =>
      url.includes("pr-comments")
        ? Promise.reject(new Error("network error"))
        : url.includes("stuck")
          ? Promise.resolve({ ok: true, json: () => Promise.resolve([STUCK_PR]) })
          : Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(/failed to load comments/i)).toBeInTheDocument();
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
  });

  it("groups comments by repo in the By-repo view", async () => {
    global.fetch = fetchWithComments([COMMENT]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("please fix the null check")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "By repo" }));
    await waitFor(() => {
      const headers = screen.getAllByTestId("group-header");
      expect(headers.some((h) => h.textContent?.includes("acme/b"))).toBe(true);
    });
  });

  it("shows the closed-PR section collapsed by default with a total count", async () => {
    global.fetch = fetchWithClosed(makeClosed(20));
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByTestId("closed-count-badge")).toHaveTextContent("20"),
    );
    // Collapsed: no rows rendered.
    expect(screen.queryByText("closed pr 0")).not.toBeInTheDocument();
  });

  it("expands to the first 15, then Load more reveals the rest (newest first)", async () => {
    global.fetch = fetchWithClosed(makeClosed(20));
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByTestId("closed-count-badge")).toHaveTextContent("20"),
    );
    fireEvent.click(screen.getByRole("button", { name: /recently merged/i }));
    expect(screen.getByText("closed pr 0")).toBeInTheDocument();
    expect(screen.getByText("closed pr 14")).toBeInTheDocument();
    expect(screen.queryByText("closed pr 15")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(screen.getByText("closed pr 15")).toBeInTheDocument();
    expect(screen.getByText("closed pr 19")).toBeInTheDocument();
  });

  it("persists the closed-section open state to localStorage", async () => {
    global.fetch = fetchWithClosed(makeClosed(3));
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByTestId("closed-count-badge")).toHaveTextContent("3"),
    );
    fireEvent.click(screen.getByRole("button", { name: /recently merged/i }));
    await waitFor(() =>
      expect(localStorage.getItem("prison.closedOpen")).toBe("true"),
    );
  });

  it("hydrates the closed section open from localStorage", async () => {
    localStorage.setItem("prison.closedOpen", "true");
    global.fetch = fetchWithClosed(makeClosed(2));
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("closed pr 0")).toBeInTheDocument();
    expect(screen.getByText("closed pr 1")).toBeInTheDocument();
  });

  it("shows an empty state when the section is open with no closed PRs", async () => {
    localStorage.setItem("prison.closedOpen", "true");
    global.fetch = fetchWithClosed([]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("No closed PRs")).toBeInTheDocument();
  });

  it("shows an error banner when the closed-PRs fetch fails", async () => {
    global.fetch = vi.fn((url: string) =>
      url.includes("closed")
        ? Promise.reject(new Error("network error"))
        : url.includes("stuck")
          ? Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve([STUCK_PR]) })
          : Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve([]) }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(/failed to load closed PRs/i)).toBeInTheDocument();
    // Unrelated sections still render.
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
  });

  it("shows an error banner on a non-ok closed-PRs response", async () => {
    global.fetch = vi.fn((url: string) =>
      Promise.resolve(
        url.includes("closed")
          ? { ok: false, status: 502, headers: { get: () => null }, json: () => Promise.resolve([]) }
          : { ok: true, headers: { get: () => null }, json: () => Promise.resolve(url.includes("stuck") ? [STUCK_PR] : []) },
      ),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(/failed to load closed PRs/i)).toBeInTheDocument();
  });
});

describe("Dashboard — recently reviewed", () => {
  const REVIEWED_PR = {
    id: "rv1",
    title: "add retry backoff",
    url: "https://github.com/acme/e/pull/9",
    number: 9,
    repo: "acme/e",
    author: "alice",
    state: "CHANGES_REQUESTED" as const,
    reviewedAt: "2026-06-20T00:00:00Z",
    updatedSince: false,
    isDraft: false,
  };

  // Serves the reviewed list; stuck carries STUCK_PR so unrelated sections
  // still render, and the comments list is supplied per test.
  function fetchWithReviewed(reviewed: unknown[], comments: unknown[] = []) {
    return vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        headers: { get: () => null },
        json: () =>
          Promise.resolve(
            url.includes("reviewed")
              ? reviewed
              : url.includes("pr-comments")
                ? comments
                : url.includes("stuck")
                  ? [STUCK_PR]
                  : [],
          ),
      }),
    ) as unknown as typeof fetch;
  }

  it("shows the section collapsed by default with a total count", async () => {
    global.fetch = fetchWithReviewed([REVIEWED_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByTestId("reviewed-count-badge")).toHaveTextContent("1"),
    );
    expect(screen.queryByText("add retry backoff")).not.toBeInTheDocument();
  });

  it("expands to the rows, carrying your own verdict", async () => {
    global.fetch = fetchWithReviewed([REVIEWED_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByTestId("reviewed-count-badge")).toHaveTextContent("1"),
    );
    fireEvent.click(screen.getByRole("button", { name: /recently reviewed/i }));
    expect(await screen.findByText("add retry backoff")).toBeInTheDocument();
    expect(screen.getByText("Changes requested")).toBeInTheDocument();
  });

  it("persists the reviewed-section open state to localStorage", async () => {
    global.fetch = fetchWithReviewed([REVIEWED_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByTestId("reviewed-count-badge")).toHaveTextContent("1"),
    );
    fireEvent.click(screen.getByRole("button", { name: /recently reviewed/i }));
    await waitFor(() =>
      expect(localStorage.getItem("prison.reviewedOpen")).toBe("true"),
    );
  });

  it("hydrates the reviewed section open from localStorage", async () => {
    localStorage.setItem("prison.reviewedOpen", "true");
    global.fetch = fetchWithReviewed([REVIEWED_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("add retry backoff")).toBeInTheDocument();
  });

  it("flags a PR pushed to since your review", async () => {
    global.fetch = fetchWithReviewed([{ ...REVIEWED_PR, updatedSince: true }]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByTestId("reviewed-count-badge")).toHaveTextContent("1"),
    );
    fireEvent.click(screen.getByRole("button", { name: /recently reviewed/i }));
    expect(await screen.findByText("Updated since")).toBeInTheDocument();
  });

  it("keeps a re-requested PR in the review queue instead of the archive", async () => {
    // GitHub reports a PR you reviewed AND were asked to review again under
    // both searches. Waiting-on-you wins — no PR in two lists.
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        headers: { get: () => null },
        json: () =>
          Promise.resolve(
            url.includes("reviewed")
              ? [{ ...REVIEWED_PR, id: REVIEW_PR.id }]
              : url.includes("review")
                ? [REVIEW_PR]
                : [],
          ),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("review pr")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("reviewed-count-badge")).toHaveTextContent("0"),
    );
  });

  it("follows the draft filter in both directions", async () => {
    global.fetch = fetchWithReviewed([REVIEWED_PR, { ...REVIEWED_PR, id: "rv2", title: "draft reviewed pr", isDraft: true }]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByTestId("reviewed-count-badge")).toHaveTextContent("2"),
    );
    fireEvent.click(screen.getByRole("button", { name: /no drafts/i }));
    await waitFor(() =>
      expect(screen.getByTestId("reviewed-count-badge")).toHaveTextContent("1"),
    );
    // Also 1, but the other one — the count alone cannot tell the two states
    // apart, so expand and name it.
    fireEvent.click(screen.getByRole("button", { name: /only drafts/i }));
    fireEvent.click(screen.getByRole("button", { name: /recently reviewed/i }));
    expect(await screen.findByText("draft reviewed pr")).toBeInTheDocument();
    expect(screen.queryByText("reviewed pr")).not.toBeInTheDocument();
  });

  it("shows a reply on a PR you reviewed in the comments column", async () => {
    // The gap this section came from: the comments column only ever showed
    // threads on your OWN PRs, so an answer to a review comment you left on
    // someone else's PR never reached the board.
    // viewerStarted is what the reviewed leg of /api/pr-comments returns.
    const reply = { ...COMMENT, id: "t9", prId: REVIEWED_PR.id, repo: "acme/e", number: 9, preview: "done, took the fixed delay out", viewerStarted: true };
    global.fetch = fetchWithReviewed([REVIEWED_PR], [reply]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("done, took the fixed delay out")).toBeInTheDocument();
  });

  it("keeps that reply when the reviewed list itself fails to load", async () => {
    // The thread is waiting on the viewer whether or not the section that would
    // have listed its PR came back.
    const reply = { ...COMMENT, id: "t9", prId: REVIEWED_PR.id, repo: "acme/e", number: 9, preview: "done, took the fixed delay out", viewerStarted: true };
    global.fetch = vi.fn((url: string) =>
      url.includes("reviewed")
        ? Promise.reject(new Error("network error"))
        : Promise.resolve({
            ok: true,
            headers: { get: () => null },
            json: () => Promise.resolve(url.includes("pr-comments") ? [reply] : []),
          }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("done, took the fixed delay out")).toBeInTheDocument();
  });

  it("shows an error banner and retry when the reviewed fetch fails", async () => {
    global.fetch = vi.fn((url: string) =>
      url.includes("reviewed")
        ? Promise.reject(new Error("network error"))
        : Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve(url.includes("stuck") ? [STUCK_PR] : []) }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(/failed to load reviewed PRs/i)).toBeInTheDocument();
    // Unrelated sections still render.
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
  });

  it("reveals a page at a time, then Load more", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...REVIEWED_PR,
      id: `rv${i}`,
      title: `reviewed pr ${i}`,
      reviewedAt: new Date(Date.UTC(2026, 5, 25) - i * 86_400_000).toISOString(),
    }));
    global.fetch = fetchWithReviewed(many);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByTestId("reviewed-count-badge")).toHaveTextContent("20"),
    );
    fireEvent.click(screen.getByRole("button", { name: /recently reviewed/i }));
    expect(await screen.findByText("reviewed pr 0")).toBeInTheDocument();
    expect(screen.queryByText("reviewed pr 15")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /load more \(showing 15 of 20\)/i }));
    expect(await screen.findByText("reviewed pr 15")).toBeInTheDocument();
  });
});

describe("Dashboard — auto refresh", () => {
  const NEW_STUCK_PR = { ...STUCK_PR, id: "new-stuck", title: "brand new stuck pr" };

  let constructed: Array<{ title: string; options?: NotificationOptions }>;
  let requestPermission: ReturnType<typeof vi.fn>;
  let setPermission: (next: NotificationPermission) => void;

  function useNotificationStub(permission: NotificationPermission) {
    ({ constructed, requestPermission, setPermission } = stubNotification(permission));
  }

  // Serves whatever `stuckList` holds at request time — tests mutate it to
  // make a later poll add, drop, or restore items. `extraBotComment` adds a
  // bot-authored comment (hidden by the default filters) the same way,
  // `failStuck` makes the stuck endpoint answer 500, and `closedList` feeds
  // the closed section.
  let stuckList: unknown[];
  let extraBotComment: boolean;
  let failStuck: boolean;
  let closedList: unknown[];
  let readyList: unknown[];
  let commentList: unknown[];
  function mutableFetch() {
    return vi.fn((url: string) => {
      if (failStuck && url.includes("stuck")) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        headers: { get: () => null },
        json: () =>
          Promise.resolve(
            url.includes("pr-comments")
              ? extraBotComment
                ? [BOT_COMMENT]
                : commentList
              : url.includes("stuck")
                ? stuckList
                : url.includes("closed")
                  ? closedList
                  : url.includes("ready")
                    ? readyList
                    : [],
          ),
      });
    }) as unknown as typeof fetch;
  }

  beforeEach(() => {
    stuckList = [STUCK_PR];
    extraBotComment = false;
    failStuck = false;
    closedList = [];
    readyList = [];
    commentList = [];
    document.title = "PRison";
    useNotificationStub("granted");
    // Pin the shortest offered interval so the timer maths stay readable;
    // the default (30 min) is exercised separately below.
    localStorage.setItem("prison.pollInterval", String(POLL_MS));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = mutableFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function fetchCalls() {
    return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
  }

  it("polls all six endpoints once per interval when enabled, without the loading banner", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(fetchCalls()).toBe(6);

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(fetchCalls()).toBe(12);
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("waits the stored interval, not the shortest one", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    const longest = POLL_INTERVAL_OPTIONS[POLL_INTERVAL_OPTIONS.length - 1].ms;
    localStorage.setItem("prison.pollInterval", String(longest));
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(fetchCalls()).toBe(6);

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(fetchCalls()).toBe(6);

    await act(() => vi.advanceTimersByTimeAsync(longest));
    expect(fetchCalls()).toBe(12);
  });

  it("defaults to 30 minutes when nothing is stored", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    localStorage.removeItem("prison.pollInterval");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(DEFAULT_POLL_INTERVAL_MS - 1000));
    expect(fetchCalls()).toBe(6);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchCalls()).toBe(12);
    await waitFor(() =>
      expect(localStorage.getItem("prison.pollInterval")).toBe(
        String(DEFAULT_POLL_INTERVAL_MS),
      ),
    );
  });

  it("persists a new interval and restarts polling on it", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    const longest = POLL_INTERVAL_OPTIONS[POLL_INTERVAL_OPTIONS.length - 1].ms;
    openSettings("Auto refresh");
    fireEvent.change(
      screen.getByRole("combobox", { name: /auto refresh interval/i }),
      { target: { value: String(longest) } },
    );
    await waitFor(() =>
      expect(localStorage.getItem("prison.pollInterval")).toBe(String(longest)),
    );

    // The old (shorter) timer must not survive the change.
    const before = fetchCalls();
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(fetchCalls()).toBe(before);
  });

  it("shows when the data was last refreshed and ages the label", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(await screen.findByText("Updated just now")).toBeInTheDocument();

    // The label ages on its own minute tick, with no further fetching.
    const before = fetchCalls();
    await act(() => vi.advanceTimersByTimeAsync(3 * 60_000));
    expect(screen.getByText("Updated 3m ago")).toBeInTheDocument();
    expect(fetchCalls()).toBe(before);
  });

  it("resets the last-refreshed label after a silent poll", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(await screen.findByText("Updated just now")).toBeInTheDocument();
  });

  it("keeps the last-refreshed label stale when every endpoint fails on a silent poll", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(await screen.findByText("Updated just now")).toBeInTheDocument();

    // Every one of the six endpoints answers 500, so the poll fetches nothing.
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 }),
    ) as unknown as typeof fetch;
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));

    // The list is untouched (silent-poll policy) and the label keeps aging from
    // the last fetch that actually landed, instead of claiming fresh data.
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
    expect(screen.getByText(`Updated ${POLL_MS / 60_000}m ago`)).toBeInTheDocument();
  });

  it("keeps the displayed list and raises no error banner when a silent poll fails", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    failStuck = true;
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
    expect(
      screen.queryByText(/failed to load stuck prs/i),
    ).not.toBeInTheDocument();

    // The next successful poll updates in place as usual.
    failStuck = false;
    stuckList = [STUCK_PR, NEW_STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.getByText("brand new stuck pr")).toBeInTheDocument();
  });

  it("does not collapse the closed-list Load more expansion on a silent poll", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    localStorage.setItem("prison.closedOpen", "true");
    closedList = makeClosed(20);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("closed pr 0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(screen.getByText("closed pr 19")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.getByText("closed pr 19")).toBeInTheDocument();
  });

  it("does not poll when auto refresh is off", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 2));
    expect(fetchCalls()).toBe(6);
  });

  it("enabling the checkbox persists and requests notification permission when undecided", async () => {
    useNotificationStub("default");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    openSettings("Auto refresh");
    fireEvent.click(screen.getByRole("checkbox", { name: /auto refresh/i }));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(localStorage.getItem("prison.autoRefresh")).toBe("true"),
    );
  });

  it("shows the granted controls once the user answers the prompt", async () => {
    // Nothing re-renders when the browser prompt is answered, so the answer has
    // to travel from the promise into state — a re-read of Notification.permission
    // would still say "default" here.
    localStorage.setItem("prison.autoRefresh", "true");
    useNotificationStub("default");
    requestPermission.mockResolvedValue("granted");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    openSettings("Auto refresh");

    fireEvent.click(screen.getByRole("button", { name: /enable notifications/i }));
    expect(
      await screen.findByRole("button", { name: /send a test notification/i }),
    ).toBeInTheDocument();
  });

  it("falls back to the live permission when the prompt rejects", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    useNotificationStub("default");
    // A prompt that throws (non-secure context, callback-only Safari) leaves the
    // answer only on Notification.permission; without the fallback read the pane
    // would keep offering an Enable button that can never succeed.
    requestPermission.mockImplementation(() => {
      setPermission("denied");
      return Promise.reject(new Error("prompt failed"));
    });
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    openSettings("Auto refresh");

    fireEvent.click(screen.getByRole("button", { name: /enable notifications/i }));
    expect(await screen.findByText(/notifications are blocked/i)).toBeInTheDocument();
  });

  it("badges the title and notifies when a poll finds new items while unfocused", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    // First poll with unchanged data: nothing to announce.
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(document.title).toBe("PRison");
    expect(constructed).toHaveLength(0);

    stuckList = [STUCK_PR, NEW_STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(document.title).toBe("(1) PRison");
    expect(constructed).toHaveLength(1);
    expect(constructed[0].options?.tag).toBe("prison-changes");
    // The body names the PR and what happened, not just a count.
    expect(constructed[0].options?.body).toBe("acme/b #2 — checks failing");

    // Returning to the tab no longer clears the badge: that is the moment
    // before the user has read anything, and the count used to reach zero
    // without ever having been looked at.
    fireEvent(window, new Event("focus"));
    expect(document.title).toBe("(1) PRison");
  });

  it("announces a PR that moved from stuck to ready — the id is not new, the news is", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    // Same PR id, now merge-ready: checks went green and it left the stuck list.
    stuckList = [];
    readyList = [{ ...READY_PR, id: STUCK_PR.id, repo: STUCK_PR.repo, number: STUCK_PR.number }];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));

    expect(document.title).toBe("(1) PRison");
    expect(constructed.at(-1)?.options?.body).toBe("acme/b #2 is ready to merge");
  });

  it("announces a check going red on a PR that was merely waiting", async () => {
    stuckList = [{ ...STUCK_PR, failingChecks: 0, pendingChecks: 1, failing: [], pending: ["build"] }];
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    stuckList = [STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(constructed.at(-1)?.options?.body).toBe("acme/b #2 — checks failing");
  });

  it("announces a fresh reply on a thread it already knows about", async () => {
    // The thread id never changes, so only its timestamp separates "already
    // seen" from "they replied again".
    commentList = [COMMENT];
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(/please fix the null check/)).toBeInTheDocument();
    constructed.length = 0;

    commentList = [{ ...COMMENT, commentedAt: "2026-06-21T00:00:00Z" }];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(constructed.at(-1)?.options?.body).toBe("acme/b #2 — new reply");
  });

  it("announces one of the user's own PRs being merged", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    stuckList = [];
    closedList = [
      closedPr({ id: STUCK_PR.id, repo: STUCK_PR.repo, number: STUCK_PR.number }),
    ];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(constructed.at(-1)?.options?.body).toBe("acme/b #2 was merged");
  });

  it("stays quiet about a PR closed without merging — that is not progress", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    stuckList = [];
    closedList = [
      closedPr({
        id: STUCK_PR.id,
        repo: STUCK_PR.repo,
        number: STUCK_PR.number,
        merged: false,
      }),
    ];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(document.title).toBe("PRison");
    expect(constructed).toHaveLength(0);
  });

  it("keeps the badge when the tab becomes visible again, and clears it when the feed is read", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    stuckList = [STUCK_PR, NEW_STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(document.title).toBe("(1) PRison");

    // jsdom's document.hidden is false, so this exercises the visible branch.
    fireEvent(document, new Event("visibilitychange"));
    expect(document.title).toBe("(1) PRison");

    fireEvent.click(screen.getByRole("button", { name: /^activity/i }));
    expect(document.title).toBe("PRison");
  });

  it("ignores new items the filters hide (bot comment with default filters)", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    // A bot comment arrives, but showBots defaults to false — it is not on
    // screen, so it must not badge or notify.
    extraBotComment = true;
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(document.title).toBe("PRison");
    expect(constructed).toHaveLength(0);
  });

  it("records to the feed while the tab is focused, but does not interrupt", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    stuckList = [STUCK_PR, NEW_STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    // A desktop notification exists to interrupt, and interrupting someone who
    // is already looking is noise. The feed is a timeline, so it takes the
    // event either way — and the bell is what makes it noticeable on screen.
    expect(constructed).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: /^activity, 1 unseen$/i }),
    ).toBeInTheDocument();
  });

  it("marks a new scope's items as seen on org switch instead of announcing them", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    // Switch scope; the new scope already contains an item we never saw.
    stuckList = [STUCK_PR, NEW_STUCK_PR];
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by organization" }), {
      target: { value: "acme" },
    });
    expect(await screen.findByText("brand new stuck pr")).toBeInTheDocument();
    expect(document.title).toBe("PRison");
    expect(constructed).toHaveLength(0);

    // The next poll sees the same data — still nothing new.
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(document.title).toBe("PRison");
    expect(constructed).toHaveLength(0);
  });

  it("does not request permission when auto refresh is restored from localStorage", async () => {
    useNotificationStub("default");
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("stops polling when auto refresh is unchecked", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(fetchCalls()).toBe(12);

    openSettings("Auto refresh");
    fireEvent.click(screen.getByRole("checkbox", { name: /auto refresh/i }));
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 2));
    expect(fetchCalls()).toBe(12);
  });

  it("starts with an empty feed — the first load is a seed, not news", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    const bell = screen.getByRole("button", { name: /^activity$/i });
    fireEvent.click(bell);
    // Everything on screen reads as new against an empty snapshot, so without
    // the seed guard the whole board would land in the feed on every load.
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
  });

  it("lists what a poll found, linking each entry to where it happened", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    stuckList = [STUCK_PR, NEW_STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));

    fireEvent.click(screen.getByRole("button", { name: /^activity, 1 unseen$/i }));
    // Scoped to the panel: the PR is also on the board behind it.
    const feed = within(screen.getByRole("region", { name: "Activity" }));
    expect(feed.getByText("acme/b #2")).toBeInTheDocument();
    expect(feed.getByText("— checks failing")).toBeInTheDocument();
    expect(feed.getByRole("link")).toHaveAttribute("href", NEW_STUCK_PR.url);
  });

  it("keeps the feed across a remount", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    const { unmount } = render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    stuckList = [STUCK_PR, NEW_STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    unmount();

    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    // Reloading is common enough that a session-only feed would mostly be empty.
    fireEvent.click(screen.getByRole("button", { name: /^activity, 1 unseen$/i }));
    const feed = within(screen.getByRole("region", { name: "Activity" }));
    expect(feed.getByText("acme/b #2")).toBeInTheDocument();
  });

  it("empties the feed on request", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    stuckList = [STUCK_PR, NEW_STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));

    fireEvent.click(screen.getByRole("button", { name: /^activity, 1 unseen$/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
    expect(localStorage.getItem("prison.activity")).toBe("[]");
  });

  it("accumulates the unseen count across polls", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    stuckList = [STUCK_PR, NEW_STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(document.title).toBe("(1) PRison");

    stuckList = [
      STUCK_PR,
      NEW_STUCK_PR,
      { ...STUCK_PR, id: "new-2", title: "second new stuck pr", number: 7 },
    ];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    // The badge accumulates (1 + 1) because unseen now survives a return to the
    // tab. The notification does not: it describes only the poll that raised
    // it, since re-announcing everything still unseen would repeat older events
    // on every poll. The accumulated history is in the feed.
    expect(document.title).toBe("(2) PRison");
    expect(constructed.at(-1)?.options?.body).toBe("acme/b #7 — checks failing");
  });

  it("stores the snapshot so a later mount has something to compare against", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    await waitFor(() =>
      expect(localStorage.getItem("prison.statusSnapshot")).toContain(STUCK_PR.id),
    );
  });

  it("leaves the stored snapshot alone on a render where nothing moved", async () => {
    // The detection effect runs on every commit, age ticks included. Rewriting
    // a thousand ids to discover they are the thousand ids already there is
    // work for its own sake.
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    await waitFor(() =>
      expect(localStorage.getItem("prison.statusSnapshot")).toContain(STUCK_PR.id),
    );

    const writes = vi.spyOn(Storage.prototype, "setItem");
    fireEvent.click(screen.getByRole("button", { name: /^by repo$/i }));
    expect(
      writes.mock.calls.filter(([key]) => key === "prison.statusSnapshot"),
    ).toHaveLength(0);
    writes.mockRestore();
  });

  it("reports what changed while it was closed, on the first fetch after a mount", async () => {
    // The whole point: nothing polls while the tab is shut, so the review that
    // landed overnight is simply the current state by morning. Diffing the
    // first fetch against the stored snapshot is what turns it back into news.
    localStorage.setItem(
      "prison.statusSnapshot",
      JSON.stringify([
        { id: STUCK_PR.id, repo: STUCK_PR.repo, number: STUCK_PR.number, url: "u", status: "pending" },
      ]),
    );
    stuckList = [];
    readyList = [{ ...READY_PR, id: STUCK_PR.id, repo: STUCK_PR.repo, number: STUCK_PR.number }];

    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("ready pr")).toBeInTheDocument();

    expect(await screen.findByRole("button", { name: /^activity, 1 unseen$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^activity, 1 unseen$/i }));
    expect(screen.getByText(/is ready to merge/i)).toBeInTheDocument();
  });

  it("stays quiet on the first ever run, when there is no snapshot to compare against", async () => {
    // Every item reads as new against an empty snapshot, so a catch-up here
    // would write the whole board into the feed as news.
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(document.title).toBe("PRison");
    expect(screen.getByRole("button", { name: /^activity$/i })).toBeInTheDocument();
  });

  it("reports the catch-up once, not again on the next render", async () => {
    localStorage.setItem(
      "prison.statusSnapshot",
      JSON.stringify([
        { id: STUCK_PR.id, repo: STUCK_PR.repo, number: STUCK_PR.number, url: "u", status: "pending" },
      ]),
    );
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByRole("button", { name: /^activity, 1 unseen$/i })).toBeInTheDocument();

    // A re-render that carries no fetch — the badge must not climb.
    fireEvent.click(screen.getByRole("button", { name: /^by repo$/i }));
    expect(screen.getByRole("button", { name: /^activity, 1 unseen$/i })).toBeInTheDocument();
  });

  it("spends the catch-up on the first fetch that landed, even when the board is empty", async () => {
    // An empty board is an answer, not a missing one — the catch-up has been
    // paid. Waiting for the first fetch that happens to carry rows instead
    // leaves the flag armed with no expiry, and the next fetch the user
    // triggers — an org switch, a Retry — poses as the catch-up and replays
    // that scope's whole board into the feed as news.
    localStorage.setItem(
      "prison.statusSnapshot",
      JSON.stringify([
        { id: STUCK_PR.id, repo: STUCK_PR.repo, number: STUCK_PR.number, url: "u", status: "pending" },
      ]),
    );
    stuckList = [];

    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(/no prs stuck on checks/i)).toBeInTheDocument();

    // A different scope, whose PR the stored snapshot last saw waiting on
    // checks and which is now failing — a change the catch-up would report if
    // it were still armed.
    stuckList = [STUCK_PR];
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by organization" }), {
      target: { value: "acme" },
    });
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    // The bell only re-renders after the detection effect's own state update
    // lands, so a "nothing was announced" assertion has to let that settle
    // first — reading straight after the row appears passes either way.
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByRole("button", { name: /^activity$/i })).toBeInTheDocument();
  });

  it("keeps the catch-up armed when every endpoint rejected, and reports it on Retry", async () => {
    // A first load where all six endpoints rejected refreshed nothing, so the
    // catch-up is still owed — landedRef, not a non-empty board, is what spends
    // it. Retry is the fetch that lands, and it still reports what moved while
    // PRison was closed.
    localStorage.setItem(
      "prison.statusSnapshot",
      JSON.stringify([
        { id: STUCK_PR.id, repo: STUCK_PR.repo, number: STUCK_PR.number, url: "u", status: "pending" },
      ]),
    );
    const serve = mutableFetch() as unknown as (url: string) => Promise<unknown>;
    let allFail = true;
    global.fetch = vi.fn((url: string) =>
      allFail ? Promise.resolve({ ok: false, status: 500 }) : serve(url),
    ) as unknown as typeof fetch;

    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(/failed to load stuck prs/i)).toBeInTheDocument();
    // Nothing landed, so nothing was reported and the flag is still unspent.
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("button", { name: /^activity$/i })).toBeInTheDocument();

    allFail = false;
    fireEvent.click(screen.getAllByRole("button", { name: /^retry$/i })[0]);

    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    // STUCK_PR was last seen waiting on checks and is now failing — the change
    // the catch-up exists to surface.
    expect(
      await screen.findByRole("button", { name: /^activity, 1 unseen$/i }),
    ).toBeInTheDocument();
  });

  it("moves ids that are still on the board to the end of the stored snapshot", async () => {
    // Re-inserting a key keeps its original slot in a Map, so a plain union
    // orders the snapshot by first sighting. The stored bound trims the front,
    // which would drop a PR that has been on the board for months while ids
    // long gone from it survive — and the next open would call it news.
    localStorage.setItem(
      "prison.statusSnapshot",
      JSON.stringify([
        { id: STUCK_PR.id, repo: STUCK_PR.repo, number: STUCK_PR.number, url: "u", status: "failing" },
        { id: "gone-1", repo: "acme/b", number: 999, url: "u", status: "failing" },
      ]),
    );
    stuckList = [STUCK_PR, NEW_STUCK_PR];

    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("prison.statusSnapshot") ?? "[]");
      // "gone-1" is the only id no longer on screen, so it is the only one left
      // at the front — the end of the list is what is still live.
      expect(stored.map((e: { id: string }) => e.id)).toEqual([
        "gone-1",
        STUCK_PR.id,
        NEW_STUCK_PR.id,
      ]);
    });
  });

  it("does not notify about the catch-up while the tab is focused", async () => {
    // Opening PRison and being told what PRison is already showing you.
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    localStorage.setItem(
      "prison.statusSnapshot",
      JSON.stringify([
        { id: STUCK_PR.id, repo: STUCK_PR.repo, number: STUCK_PR.number, url: "u", status: "pending" },
      ]),
    );
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByRole("button", { name: /^activity, 1 unseen$/i })).toBeInTheDocument();
    expect(constructed).toHaveLength(0);
  });

  it("re-reads permission when the test notification is sent", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    openSettings("Auto refresh");
    fireEvent.click(screen.getByRole("button", { name: /send a test notification/i }));
    expect(constructed).toHaveLength(1);

    // Revoked in site settings without a reload: the button would silently do
    // nothing, so the next click swaps it for the blocked hint.
    useNotificationStub("denied");
    fireEvent.click(screen.getByRole("button", { name: /send a test notification/i }));
    expect(await screen.findByText(/notifications are blocked/i)).toBeInTheDocument();
  });

  it("re-reads permission when Settings is opened", async () => {
    // Unblocking PRison in site settings is a change nothing in the page can
    // hear, so a permission read once at mount would keep claiming it is
    // blocked while notifications actually work.
    useNotificationStub("denied");
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    openSettings("Auto refresh");
    expect(screen.getByText(/notifications are blocked/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close settings/i }));
    useNotificationStub("granted");
    openSettings("Auto refresh");
    expect(
      screen.getByRole("button", { name: /send a test notification/i }),
    ).toBeInTheDocument();
  });

  it("announces the second failure after a push reset the checks", async () => {
    // The quiet middle step still has to be recorded as seen, or the PR looks
    // like it never left "failing" and the re-run's failure goes unreported.
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    stuckList = [{ ...STUCK_PR, failingChecks: 0, pendingChecks: 1, failing: [], pending: ["build"] }];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(constructed).toHaveLength(0);

    stuckList = [STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(constructed.at(-1)?.options?.body).toBe("acme/b #2 — checks failing");
  });

  it("counts an item that moves twice while away only once", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    stuckList = [{ ...STUCK_PR, failingChecks: 0, pendingChecks: 1, failing: [], pending: ["build"] }];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    stuckList = [];
    readyList = [
      { ...READY_PR, id: STUCK_PR.id, repo: STUCK_PR.repo, number: STUCK_PR.number },
    ];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));

    // Same PR, two transitions: the badge is a count of items needing a look,
    // and the notification carries only its latest state.
    expect(document.title).toBe("(1) PRison");
    expect(constructed.at(-1)?.options?.body).toBe("acme/b #2 is ready to merge");
  });

  it("does not re-notify an item that flaps out and back", async () => {
    stuckList = [STUCK_PR, NEW_STUCK_PR];
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("brand new stuck pr")).toBeInTheDocument();

    // The item vanishes on one poll and returns on the next.
    stuckList = [STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    stuckList = [STUCK_PR, NEW_STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));

    expect(document.title).toBe("PRison");
    expect(constructed).toHaveLength(0);
  });

  it("badges but never constructs a notification when permission is denied", async () => {
    useNotificationStub("denied");
    localStorage.setItem("prison.autoRefresh", "true");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    stuckList = [STUCK_PR, NEW_STUCK_PR];
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(document.title).toBe("(1) PRison");
    expect(constructed).toHaveLength(0);
  });
});

// The stuck branch of the silent-poll guard is covered above; these cover the
// other four, which have the same "keep the list, stay quiet" contract.
describe("Dashboard — silent poll failure on the non-stuck lists", () => {
  // Every list serves one item so a failed poll has something to preserve;
  // `failPath` makes exactly one endpoint answer 500 from the next poll on.
  let failPath: string | null;
  // /api/pr-comments runs two searches and answers 200 with X-Incomplete when
  // only one of them came back — a truncated list, not a failed fetch.
  let commentsIncomplete: boolean;

  function pollFetch() {
    return vi.fn((url: string) => {
      if (failPath && url.includes(failPath)) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      if (commentsIncomplete && url.includes("pr-comments")) {
        return Promise.resolve({
          ok: true,
          headers: { get: (h: string) => (h === "X-Partial" || h === "X-Incomplete" ? "1" : null) },
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({
        ok: true,
        headers: { get: () => null },
        json: () =>
          Promise.resolve(
            url.includes("reviewed")
              ? []
              : url.includes("closed")
              ? makeClosed(1)
              : url.includes("pr-comments")
                ? [COMMENT]
                : url.includes("ready")
                  ? [READY_PR]
                  : url.includes("stuck")
                    ? [STUCK_PR]
                    : [REVIEW_PR],
          ),
      });
    }) as unknown as typeof fetch;
  }

  const CASES = [
    {
      list: "review-requests",
      path: "review-requests",
      item: "review pr",
      banner: /failed to load review requests/i,
    },
    {
      list: "ready-prs",
      path: "ready-to-merge",
      item: "ready pr",
      banner: /failed to load ready-to-merge prs/i,
    },
    {
      list: "pr-comments",
      path: "pr-comments",
      item: "please fix the null check",
      banner: /failed to load comments/i,
    },
    {
      list: "closed-prs",
      path: "closed-prs",
      item: "closed pr 0",
      banner: /failed to load closed prs/i,
    },
  ];

  beforeEach(() => {
    failPath = null;
    commentsIncomplete = false;
    localStorage.setItem("prison.autoRefresh", "true");
    localStorage.setItem("prison.pollInterval", String(POLL_MS));
    localStorage.setItem("prison.closedOpen", "true");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = pollFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(CASES)("keeps the $list list on screen when its silent poll fails", async ({ path, item }) => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(item)).toBeInTheDocument();

    failPath = path;
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.getByText(item)).toBeInTheDocument();
  });

  it.each(CASES)("raises no $list error banner when its silent poll fails", async ({ path, item, banner }) => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(item)).toBeInTheDocument();

    failPath = path;
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.queryByText(banner)).not.toBeInTheDocument();
  });

  it.each(CASES)("restores the $list list from the next successful poll", async ({ path, item }) => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText(item)).toBeInTheDocument();

    failPath = path;
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    failPath = null;
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.getByText(item)).toBeInTheDocument();
  });

  it("keeps the comments on screen when a silent poll comes back missing a search", async () => {
    // A 200 that dropped one of the two searches is a failure wearing a
    // success's clothes. Replacing the list with it would wipe the threads,
    // and the next poll would then announce them all over again as new.
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("please fix the null check")).toBeInTheDocument();

    commentsIncomplete = true;
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.getByText("please fix the null check")).toBeInTheDocument();
    // The section stays silent here on purpose, so the global banner is the
    // only thing left to say the list is older than the rest of the page.
    expect(screen.getByText(/some data couldn't be loaded/i)).toBeInTheDocument();
  });

  it("still takes a truncated list on a refresh the viewer asked for", async () => {
    // Asked-for is the opposite case: someone is looking, the banner explains
    // the gap, and freezing the list would hide it.
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("please fix the null check")).toBeInTheDocument();

    const refreshButton = screen.getByRole("button", { name: /^refresh$/i });
    await waitFor(() => expect(refreshButton).toBeEnabled());

    commentsIncomplete = true;
    fireEvent.click(refreshButton);
    await waitFor(() =>
      expect(screen.queryByText("please fix the null check")).not.toBeInTheDocument(),
    );
    // And it says so, rather than rendering "No comments awaiting your reply" —
    // a confident claim built on half a list.
    expect(screen.getByText(/some comment threads couldn't be loaded/i)).toBeInTheDocument();
    // Once, not twice: the section's own message replaces the global banner
    // rather than sitting under it with a second Retry button.
    expect(screen.queryByText(/some data couldn't be loaded/i)).not.toBeInTheDocument();
  });
});

// The section index is the whole of the answer to a board that no longer fits
// on a screen. Plain anchors, so nothing but a matching id makes them work —
// and an id lives in a different file from every href that names it.
describe("Dashboard — jumping to a section", () => {
  beforeEach(() => {
    global.fetch = okFetch();
  });

  it("gives every in-page link a target that exists", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("ready pr")).toBeInTheDocument();

    const hashLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'),
    );
    // Guard against the list going quietly empty and the loop below passing on
    // nothing: one entry per section, and every section is in the index.
    expect(hashLinks).toHaveLength(6);
    // Every section, not most of them: the arrangement this replaced reached
    // four of six, and the two it missed were the ones at the foot of the page.
    expect(hashLinks.map((a) => a.getAttribute("href"))).toEqual([
      "#ready-to-merge",
      "#comments-awaiting-reply",
      "#waiting-on-your-review",
      "#stuck-on-checks",
      "#recently-reviewed",
      "#recently-closed",
    ]);
    for (const link of hashLinks) {
      const id = link.getAttribute("href")!.slice(1);
      const target = document.getElementById(id);
      expect(target, `no element with id "${id}"`).not.toBeNull();
      // -1 rather than absent: an anchor is only half a jump if the caret stays
      // at the top of the page, and only a focusable target moves it.
      expect(target).toHaveAttribute("tabindex", "-1");
    }
  });
});

// The board used to be rows: review beside stuck, then the two histories beside
// each other. A grid row is as tall as its tallest cell, so expanding the stuck
// list pushed "Recently reviewed" — a different set of PRs entirely — down with
// it. Columns paired by subject remove the coupling; that they are also the
// pairing the queries make (others' PRs vs your own) is what makes it right
// rather than merely convenient.
describe("Dashboard — column pairing", () => {
  beforeEach(() => {
    global.fetch = okFetch();
  });

  const nearestCommon = (a: HTMLElement, b: HTMLElement) => {
    for (let n = a.parentElement; n; n = n.parentElement) {
      if (n.contains(b)) return n;
    }
    return null;
  };

  it.each([
    ["waiting-on-your-review", "recently-reviewed", "stuck-on-checks"],
    ["stuck-on-checks", "recently-closed", "waiting-on-your-review"],
  ])("keeps %s and %s in a column that excludes %s", async (queue, history, other) => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("ready pr")).toBeInTheDocument();

    const column = nearestCommon(
      document.getElementById(queue)!,
      document.getElementById(history)!,
    );
    expect(column).not.toBeNull();
    // The column that holds both must not reach across to the other queue —
    // that containment is what a shared grid row would reintroduce.
    expect(column!.contains(document.getElementById(other))).toBe(false);
  });
});

// One box over six lists. The rows are already on the page, so this filters
// what is rendered rather than asking GitHub anything.
describe("Dashboard — searching the board", () => {
  beforeEach(() => {
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        headers: { get: () => null },
        json: () =>
          Promise.resolve(
            url.includes("reviewed")
              ? []
              : url.includes("closed")
                ? []
                : url.includes("pr-comments")
                  ? [COMMENT]
                  : url.includes("ready")
                    ? [READY_PR]
                    : url.includes("stuck")
                      ? [STUCK_PR]
                      : [REVIEW_PR],
          ),
      }),
    ) as unknown as typeof fetch;
  });

  const search = async (text: string) => {
    const box = await screen.findByRole("searchbox", { name: /search the board/i });
    fireEvent.change(box, { target: { value: text } });
    return box;
  };

  it("narrows every list at once", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    await search("stuck");
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
    // Rows from the other lists are gone, not merely reordered.
    expect(screen.queryByText("ready pr")).not.toBeInTheDocument();
    expect(screen.queryByText("review pr")).not.toBeInTheDocument();
    expect(screen.queryByText("please fix the null check")).not.toBeInTheDocument();
  });

  // The question the board could answer and could not be asked.
  it("finds a PR by the name of the check that is red on it", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    await search("build");
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
    expect(screen.queryByText("review pr")).not.toBeInTheDocument();
  });

  it("requires every term, each free to match a different field", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("review pr")).toBeInTheDocument();

    // "alice" is the author, "acme/c" the repo — different fields, one row.
    await search("alice acme/c");
    expect(screen.getByText("review pr")).toBeInTheDocument();

    await search("alice acme/gamma");
    expect(screen.queryByText("review pr")).not.toBeInTheDocument();
  });

  // Good news and no-match must not look the same.
  it("says a section is filtered rather than empty", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("review pr")).toBeInTheDocument();

    await search("zzz");
    expect(screen.getAllByText(/nothing here matches “zzz”/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("No PRs waiting on your review 🎉")).not.toBeInTheDocument();
  });

  it("counts what is on screen, so the tiles and the index agree with it", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    await search("stuck");
    const tile = screen
      .getAllByTestId("summary-tile")
      .find((t) => t.textContent?.includes("Waiting on you")) as HTMLElement;
    expect(tile).toHaveTextContent("0");
    expect(
      screen.getByRole("link", { name: /PRs waiting on your review/i }),
    ).toHaveTextContent("0");
  });

  it("brings everything back on Escape", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("ready pr")).toBeInTheDocument();

    const box = await search("stuck");
    expect(screen.queryByText("ready pr")).not.toBeInTheDocument();

    fireEvent.keyDown(box, { key: "Escape" });
    expect(await screen.findByText("ready pr")).toBeInTheDocument();
  });
});
