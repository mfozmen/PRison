import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { Dashboard } from "./Dashboard";

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

function okFetch() {
  // THREE-WAY: ready → [READY_PR], stuck → [STUCK_PR], else (review) → [REVIEW_PR]
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      headers: { get: () => null },
      json: () =>
        Promise.resolve(
          url.includes("ready")
            ? [READY_PR]
            : url.includes("stuck")
              ? [STUCK_PR]
              : [REVIEW_PR],
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
          url.includes("ready") ? [READY_PR] : url.includes("stuck") ? [STUCK_PR] : [REVIEW_PR],
        ),
    }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = okFetch();
});

describe("Dashboard", () => {
  it("loads both lists across all orgs on mount (no org scope)", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
    expect(screen.getByText("review pr")).toBeInTheDocument();
    // Default selection is "All", so requests carry no org param.
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.every((c) => !String(c[0]).includes("org="))).toBe(true);
    expect(localStorage.getItem("prison.org")).toBe("");
  });

  it("scopes the fetch and persists when an org is selected", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("review pr")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText(/failed to load stuck prs/i)).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("stuck-beta")).toBeInTheDocument(),
    );
    // The stale "All" response now resolves and must be ignored.
    resolvers["all"]();
    await waitFor(() =>
      expect(screen.getByText("stuck-beta")).toBeInTheDocument(),
    );
    expect(screen.queryByText("stuck-all")).not.toBeInTheDocument();
  });

  it("selecting the personal option fetches with ?user= and persists", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "a b" } });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c) => String(c[0]).includes("org=a%20b"))).toBe(true);
    });
  });

  it("shows a failing check name in the stuck detail", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByText("build")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("lint")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("f1")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("f1")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("f1")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("3 failing · 2 pending")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("Some required checks run on GitHub and aren't shown here.")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("Review required")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("Changes requested")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("Has merge conflicts — resolve them on GitHub.")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("ci")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("Has merge conflicts — resolve them on GitHub.")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("Some required checks run on GitHub and aren't shown here.")).toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(screen.getByText("draft stuck pr")).toBeInTheDocument(),
    );
    expect(screen.getByText("draft review pr")).toBeInTheDocument();

    // Check the hide-drafts checkbox
    fireEvent.click(screen.getByRole("checkbox", { name: /hide drafts/i }));

    await waitFor(() =>
      expect(screen.queryByText("draft stuck pr")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("draft review pr")).not.toBeInTheDocument();
    expect(screen.getByText("stuck pr")).toBeInTheDocument();
    expect(screen.getByText("review pr")).toBeInTheDocument();
  });

  it("persists hideDrafts toggle to localStorage", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /hide drafts/i }));
    await waitFor(() =>
      expect(localStorage.getItem("prison.hideDrafts")).toBe("true"),
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
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
    expect(screen.queryByText("draft stuck pr")).not.toBeInTheDocument();
    expect(screen.queryByText("draft review pr")).not.toBeInTheDocument();
  });

  describe("prioritize-blocking", () => {
    it("review list renders before the stuck list in the DOM", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      const html = document.body.innerHTML;
      expect(html.indexOf("PRs waiting on your review")).toBeLessThan(
        html.indexOf("PRs stuck on checks"),
      );
    });

    it("review list count badge uses warning style when items are present", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("review pr")).toBeInTheDocument(),
      );
      const heading = screen.getByRole("heading", { name: /prs waiting on your review/i });
      const badge = heading.closest("section")?.querySelector('[data-testid="count-badge"]');
      expect(badge).toHaveClass("bg-warning");
    });

    it("review row shows 'Blocking @author' with amber styling", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("review pr")).toBeInTheDocument(),
      );
      expect(screen.getByText(/Blocking @alice/)).toBeInTheDocument();
      expect(screen.queryByText(/Requested by/)).not.toBeInTheDocument();
    });

    it("By check button is present in the toggle", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: /^by check$/i }),
      ).toBeInTheDocument();
    });

    it("By check button toggles groupBy to check and persists", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByTestId("group-header")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByTestId("group-header")).toBeInTheDocument(),
      );
      expect(screen.getByTestId("group-header").textContent).toContain("Review required");
      expect(screen.getByTestId("group-header").textContent).not.toContain("Other");
    });

    it("review list stays flat in By check mode (no group headers in review section)", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("review pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: /^by check$/i }));
      await waitFor(() =>
        expect(localStorage.getItem("prison.groupBy")).toBe("check"),
      );
    });

    it("By-repo subheaders are links to the repo on GitHub", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByTestId("group-header")).toBeInTheDocument(),
      );
      // The group header for "build" should not be a link
      expect(
        screen.queryByRole("link", { name: /build/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("stuck list count badge uses danger style when items are present", async () => {
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
    const heading = screen.getByRole("heading", { name: /prs stuck on checks/i });
    const badge = heading.closest("section")?.querySelector('[data-testid="count-badge"]');
    expect(badge).toHaveClass("bg-danger");
  });

  describe("refresh button", () => {
    it("renders a Refresh button", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: /^refresh$/i }),
      ).toBeInTheDocument();
    });

    it("re-fetches all lists when Refresh is clicked", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
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
        // One refresh = one stuck-prs fetch + one review-requests fetch + one ready-to-merge fetch.
        expect(after).toBe(before + 3);
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
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      expect(screen.getByRole("button", { name: /^flat$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^by repo$/i })).toBeInTheDocument();
    });

    it('defaults to Flat: "Flat" is pressed, "By repo" is not', async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: /^by repo$/i }));
      await waitFor(() =>
        expect(localStorage.getItem("prison.groupBy")).toBe("repo"),
      );
    });

    it('persists "flat" to localStorage when "Flat" is clicked after "By repo"', async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: /^by repo$/i }));
      fireEvent.click(screen.getByRole("button", { name: /^flat$/i }));
      await waitFor(() =>
        expect(localStorage.getItem("prison.groupBy")).toBe("flat"),
      );
    });

    it('hydrates "By repo" from localStorage', async () => {
      localStorage.setItem("prison.groupBy", "repo");
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );

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
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      // No visible "Awaiting:" label and no accessible awaiting chip
      expect(screen.queryByText("Awaiting:")).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^Awaiting:/)).not.toBeInTheDocument();
    });

    it("opening settings via gear button renders the tracked checks panel", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: "Tracked checks settings" }));
      expect(screen.getByText("Tracked checks")).toBeInTheDocument();
    });

    it("hydrates tracked config from localStorage and persists it back", async () => {
      localStorage.setItem(
        "prison.trackedChecks",
        JSON.stringify({ orgs: { acme: ["qa/smoke"] }, repos: {} }),
      );
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      const stored = localStorage.getItem("prison.trackedChecks");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.orgs.acme).toContain("qa/smoke");
    });

    it("passes distinct repos from loaded PR lists as suggestions to the settings modal", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      // STUCK_PR.repo = "acme/b", REVIEW_PR.repo = "acme/c", READY_PR.repo = "acme/d"
      fireEvent.click(screen.getByRole("button", { name: "Tracked checks settings" }));
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
        await waitFor(() => expect(screen.getByText("build")).toBeInTheDocument());
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
        await waitFor(() => expect(screen.getByText("ci/required")).toBeInTheDocument());
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
        await waitFor(() =>
          expect(screen.getByText("PR A ready-via-blocked")).toBeInTheDocument(),
        );

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

  describe("partial-data notice", () => {
    it("shows the partial-data notice when a list responds with X-Partial", async () => {
      global.fetch = partialFetch();
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText(/Some data couldn't be loaded/i)).toBeInTheDocument(),
      );
      // Retry button present and clickable
      const notice = screen.getByRole("status");
      expect(within(notice).getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });

    it("shows no partial-data notice when no list is partial", async () => {
      // okFetch (default from beforeEach) returns X-Partial: null everywhere
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("stuck pr")).toBeInTheDocument(),
      );
      expect(screen.queryByText(/Some data couldn't be loaded/i)).not.toBeInTheDocument();
    });
  });

  describe("ready-to-merge", () => {
    it("renders the ready-to-merge list with its fetched items", async () => {
      // beforeEach okFetch returns [READY_PR] for ready endpoints
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("ready pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByText("Nothing ready to merge")).toBeInTheDocument(),
      );
    });

    it("renders the ready list above the two columns", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("Ready to merge")).toBeInTheDocument(),
      );
      const html = document.body.innerHTML;
      expect(html.indexOf("Ready to merge")).toBeLessThan(
        html.indexOf("PRs waiting on your review"),
      );
    });

    it("includes ready-to-merge in a Refresh", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("ready pr")).toBeInTheDocument(),
      );
      // Wait for the mount fetches to settle so the button is enabled — clicking
      // while it is still disabled (mount load in flight) is a no-op and races
      // under full-suite concurrency.
      const refreshButton = screen.getByRole("button", { name: /^refresh$/i });
      await waitFor(() => expect(refreshButton).toBeEnabled());
      fireEvent.click(refreshButton);
      // 3 fetches on mount + 3 on refresh (stuck + review + ready) = 6 total.
      // Use waitFor so the assertion retries until all async refresh fetches register.
      await waitFor(() =>
        expect(global.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(6),
      );
    });

    it("shows a 'Merge on GitHub' link on a ready row", async () => {
      // okFetch returns [READY_PR]; suggestReady returns { text: "Merge on GitHub", href: pr.url }
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("Merge on GitHub")).toBeInTheDocument(),
      );
    });

    it("ready list count badge uses success style when items are present", async () => {
      render(<Dashboard orgs={ORGS} login="testuser" />);
      await waitFor(() =>
        expect(screen.getByText("ready pr")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(screen.getByText("Needs update")).toBeInTheDocument(),
      );
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
      await waitFor(() =>
        expect(
          screen.getByText(/failed to load ready-to-merge/i),
        ).toBeInTheDocument(),
      );
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });
  });
});
