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
  stuckSince: "2026-06-20T00:00:00Z",
};

const REVIEW_PR = {
  id: "9",
  title: "review pr",
  url: "u",
  repo: "acme/c",
  number: 9,
  author: "alice",
  requestedAt: "2026-06-22T00:00:00Z",
};

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
});
