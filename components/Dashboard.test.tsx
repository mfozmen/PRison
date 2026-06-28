import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
  isDraft: false,
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

const ORGS = [
  { login: "acme", avatarUrl: "a" },
  { login: "beta", avatarUrl: "b" },
];

function okFetch() {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(url.includes("stuck") ? [STUCK_PR] : [REVIEW_PR]),
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
        : Promise.resolve({ ok: true, json: () => Promise.resolve([REVIEW_PR]) }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByText(/failed to load stuck prs/i)).toBeInTheDocument(),
    );
  });

  it("shows an error banner when the review fetch fails", async () => {
    global.fetch = vi.fn((url: string) =>
      url.includes("review")
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
          Promise.resolve(url.includes("stuck") ? [PENDING_PR] : [REVIEW_PR]),
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
          Promise.resolve(url.includes("stuck") ? [MANY_PR] : [REVIEW_PR]),
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
          Promise.resolve(url.includes("stuck") ? [FOUR_FAILING_PR] : [REVIEW_PR]),
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
          Promise.resolve(url.includes("stuck") ? [LOPSIDED_PR] : [REVIEW_PR]),
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
          Promise.resolve(url.includes("stuck") ? [NO_NAMES_PR] : [REVIEW_PR]),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await waitFor(() =>
      expect(screen.getByText("3 failing · 2 pending")).toBeInTheDocument(),
    );
  });

  it("hides draft items from both lists when hide-drafts is checked", async () => {
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes("stuck")
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
            url.includes("stuck")
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
              url.includes("stuck") ? [STUCK_PR, STUCK_PR_B] : [REVIEW_PR],
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

      // Now group headers appear (two distinct repos in stuck list)
      await waitFor(() =>
        expect(screen.getAllByTestId("group-header").length).toBeGreaterThan(0),
      );
    });
  });
});
