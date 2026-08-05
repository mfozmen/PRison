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
  preview: "please fix the null check",
  commentedAt: "2026-06-19T00:00:00Z",
  viewerReacted: false,
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
  // FIVE-WAY: closed-prs → [], pr-comments → [], ready → [READY_PR], stuck → [STUCK_PR], else (review) → [REVIEW_PR]
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      headers: { get: () => null },
      json: () =>
        Promise.resolve(
          url.includes("closed")
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
          url.includes("closed")
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
          url.includes("closed")
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
          url.includes("closed")
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

  it("DIRTY + review-required PR shows the conflicts note, not a review chip (conflicts win)", async () => {
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
    expect(await screen.findByText("Has merge conflicts — resolve them on GitHub.")).toBeInTheDocument();
    expect(screen.queryByText("Review required")).not.toBeInTheDocument();
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

  it("DIRTY PR shows the merge-conflicts note", async () => {
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
    expect(await screen.findByText("Has merge conflicts — resolve them on GitHub.")).toBeInTheDocument();
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

  it("hides draft items from both lists when hide-drafts is checked", async () => {
    global.fetch = vi.fn((url: string) =>
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

    render(<Dashboard orgs={ORGS} login="testuser" />);
    // Both drafts visible initially
    expect(await screen.findByText("draft stuck pr")).toBeInTheDocument();
    expect(screen.getByText("draft review pr")).toBeInTheDocument();

    // Hide drafts is a filter-bar toggle, not a Settings checkbox.
    const toggle = screen.getByRole("button", { name: /hide drafts/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await waitFor(() =>
      expect(screen.queryByText("draft stuck pr")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("draft review pr")).not.toBeInTheDocument();
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
    expect(screen.getByText("review pr")).toBeInTheDocument();
  });

  it("persists hideDrafts toggle to localStorage", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hide drafts/i }));
    await waitFor(() =>
      expect(localStorage.getItem("prison.hideDrafts")).toBe("true"),
    );
  });

  it("restores the pressed state of the hide-drafts toggle on mount", async () => {
    localStorage.setItem("prison.hideDrafts", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide drafts/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("hydrates hideDrafts from localStorage", async () => {
    localStorage.setItem("prison.hideDrafts", "true");
    global.fetch = vi.fn((url: string) =>
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
        // One refresh = stuck-prs + review-requests + ready-to-merge + pr-comments + closed-prs.
        expect(after).toBe(before + 5);
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
      expect(screen.getByLabelText("Awaiting: qa/smoke")).toBeInTheDocument();
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

      const before = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
      const retries = screen.getAllByRole("button", { name: /retry/i });
      expect(retries).toHaveLength(5);
      for (const retry of retries) fireEvent.click(retry);
      await waitFor(() =>
        expect(
          (global.fetch as ReturnType<typeof vi.fn>).mock.calls,
        ).toHaveLength(before + 5 * retries.length),
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
        ).toHaveLength(10),
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
      expect(screen.getByText("Ready to merge")).toBeInTheDocument();
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
      expect(await screen.findByText("Ready to merge")).toBeInTheDocument();
      const html = document.body.innerHTML;
      expect(html.indexOf("Ready to merge")).toBeLessThan(
        html.indexOf("PRs waiting on your review"),
      );
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
      // 5 fetches on mount + 5 on refresh (stuck + review + ready + comments + closed) = 10 total.
      // Use waitFor so the assertion retries until all async refresh fetches register.
      await waitFor(() =>
        expect(global.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(10),
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

  it("polls all five endpoints once per interval when enabled, without the loading banner", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(fetchCalls()).toBe(5);

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(fetchCalls()).toBe(10);
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("waits the stored interval, not the shortest one", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    const longest = POLL_INTERVAL_OPTIONS[POLL_INTERVAL_OPTIONS.length - 1].ms;
    localStorage.setItem("prison.pollInterval", String(longest));
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();
    expect(fetchCalls()).toBe(5);

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(fetchCalls()).toBe(5);

    await act(() => vi.advanceTimersByTimeAsync(longest));
    expect(fetchCalls()).toBe(10);
  });

  it("defaults to 30 minutes when nothing is stored", async () => {
    localStorage.setItem("prison.autoRefresh", "true");
    localStorage.removeItem("prison.pollInterval");
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByText("stuck pr")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(DEFAULT_POLL_INTERVAL_MS - 1000));
    expect(fetchCalls()).toBe(5);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchCalls()).toBe(10);
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

    // Every one of the five endpoints answers 500, so the poll fetches nothing.
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
    expect(fetchCalls()).toBe(5);
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
    expect(await screen.findByText("brand new stuck pr")).toBeInTheDocument();
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
    expect(fetchCalls()).toBe(10);

    openSettings("Auto refresh");
    fireEvent.click(screen.getByRole("checkbox", { name: /auto refresh/i }));
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 2));
    expect(fetchCalls()).toBe(10);
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

  function pollFetch() {
    return vi.fn((url: string) => {
      if (failPath && url.includes(failPath)) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        headers: { get: () => null },
        json: () =>
          Promise.resolve(
            url.includes("closed")
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
});
