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

beforeEach(() => {
  localStorage.clear();
  global.fetch = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          url.includes("stuck") ? [STUCK_PR] : [REVIEW_PR],
        ),
    }),
  ) as unknown as typeof fetch;
});

describe("Dashboard", () => {
  it("renders both lists for the selected org", async () => {
    render(
      <Dashboard
        orgs={[{ login: "acme", avatarUrl: "a" }]}
        login="testuser"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
    expect(screen.getByText("review pr")).toBeInTheDocument();
    expect(localStorage.getItem("prison.org")).toBe("acme");
  });

  it("hydrates the selected org from localStorage on mount", async () => {
    localStorage.setItem("prison.org", "beta");
    render(
      <Dashboard
        orgs={[
          { login: "acme", avatarUrl: "a" },
          { login: "beta", avatarUrl: "b" },
        ]}
        login="testuser"
      />,
    );

    // The persisted org is applied after mount and drives the data fetch.
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some((c) => String(c[0]).includes("org=beta")),
      ).toBe(true);
    });

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("beta");
    expect(localStorage.getItem("prison.org")).toBe("beta");
  });

  it("persists org change to localStorage", async () => {
    render(
      <Dashboard
        orgs={[
          { login: "acme", avatarUrl: "a" },
          { login: "beta", avatarUrl: "b" },
        ]}
        login="testuser"
      />,
    );
    // Wait for initial render
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "beta" } });

    await waitFor(() =>
      expect(localStorage.getItem("prison.org")).toBe("beta"),
    );
  });

  it("shows error banner and retry button when stuck-prs fetch fails", async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes("stuck")) {
        return Promise.reject(new Error("network error"));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([REVIEW_PR]),
      });
    }) as unknown as typeof fetch;

    render(
      <Dashboard
        orgs={[{ login: "acme", avatarUrl: "a" }]}
        login="testuser"
      />,
    );

    // Review list still renders
    await waitFor(() =>
      expect(screen.getByText("review pr")).toBeInTheDocument(),
    );

    // Error banner and retry button appear for stuck list
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
  });

  it("shows error banner when stuck-prs returns a non-ok response", async () => {
    global.fetch = vi.fn((url: string) =>
      url.includes("stuck")
        ? Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve([]),
          })
        : Promise.resolve({
            ok: true,
            json: () => Promise.resolve([REVIEW_PR]),
          }),
    ) as unknown as typeof fetch;

    render(
      <Dashboard
        orgs={[{ login: "acme", avatarUrl: "a" }]}
        login="testuser"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/failed to load stuck prs/i),
      ).toBeInTheDocument(),
    );
  });

  it("shows error banner when review-requests fetch fails", async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes("review")) {
        return Promise.reject(new Error("network error"));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([STUCK_PR]),
      });
    }) as unknown as typeof fetch;

    render(
      <Dashboard
        orgs={[{ login: "acme", avatarUrl: "a" }]}
        login="testuser"
      />,
    );

    // Stuck list still renders
    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );

    // Error banner and retry button appear for review list
    expect(screen.getByText(/failed to load review requests/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
  });

  it("recovers when the retry button is clicked after an error", async () => {
    let stuckShouldFail = true;
    global.fetch = vi.fn((url: string) => {
      if (url.includes("stuck")) {
        return stuckShouldFail
          ? Promise.reject(new Error("network error"))
          : Promise.resolve({ ok: true, json: () => Promise.resolve([STUCK_PR]) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([REVIEW_PR]),
      });
    }) as unknown as typeof fetch;

    render(
      <Dashboard
        orgs={[{ login: "acme", avatarUrl: "a" }]}
        login="testuser"
      />,
    );

    // Error banner appears for the failed stuck fetch.
    const retry = await screen.findByRole("button", { name: /retry/i });

    // Next fetch will succeed; clicking Retry should recover the stuck list.
    stuckShouldFail = false;
    fireEvent.click(retry);

    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/failed to load stuck prs/i),
    ).not.toBeInTheDocument();
  });

  it("discards a stale in-flight response when the org changes mid-flight", async () => {
    const resolvers: Record<string, () => void> = {};
    global.fetch = vi.fn((url: string) => {
      const org = new URL(url, "http://x").searchParams.get("org") as string;
      if (url.includes("stuck")) {
        return new Promise((resolve) => {
          resolvers[org] = () =>
            resolve({
              ok: true,
              json: () =>
                Promise.resolve([
                  { ...STUCK_PR, id: org, title: `stuck-${org}` },
                ]),
            });
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }) as unknown as typeof fetch;

    render(
      <Dashboard
        orgs={[
          { login: "acme", avatarUrl: "a" },
          { login: "beta", avatarUrl: "b" },
        ]}
        login="testuser"
      />,
    );

    // acme stuck fetch is in-flight; switch to beta before it resolves.
    await waitFor(() => expect(resolvers["acme"]).toBeDefined());
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "beta" },
    });
    await waitFor(() => expect(resolvers["beta"]).toBeDefined());

    // Resolve the STALE (acme) response first, then the current (beta) one.
    resolvers["acme"]();
    resolvers["beta"]();

    await waitFor(() =>
      expect(screen.getByText("stuck-beta")).toBeInTheDocument(),
    );
    // The stale acme payload must never overwrite the current org's data.
    expect(screen.queryByText("stuck-acme")).not.toBeInTheDocument();
  });

  it("shows error banner when review-requests returns a non-ok response", async () => {
    global.fetch = vi.fn((url: string) =>
      url.includes("review")
        ? Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve([]),
          })
        : Promise.resolve({
            ok: true,
            json: () => Promise.resolve([STUCK_PR]),
          }),
    ) as unknown as typeof fetch;

    render(
      <Dashboard
        orgs={[{ login: "acme", avatarUrl: "a" }]}
        login="testuser"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/failed to load review requests/i),
      ).toBeInTheDocument(),
    );
  });

  it("shows org-fetch error notice when orgsError is true", () => {
    render(
      <Dashboard orgs={[]} login="testuser" orgsError={true} />,
    );
    expect(
      screen.getByText(/couldn't load your organizations/i),
    ).toBeInTheDocument();
  });

  it("does not show org-fetch error notice when orgsError is absent", () => {
    render(
      <Dashboard
        orgs={[{ login: "acme", avatarUrl: "a" }]}
        login="testuser"
      />,
    );
    expect(
      screen.queryByText(/couldn't load your organizations/i),
    ).not.toBeInTheDocument();
  });

  it("encodes the org name in both fetch URLs", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn((url: string) => {
      calls.push(url);
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(url.includes("stuck") ? [STUCK_PR] : [REVIEW_PR]),
      });
    }) as unknown as typeof fetch;

    // An org value with characters that must be percent-encoded in a query string.
    render(
      <Dashboard
        orgs={[{ login: "a b&c", avatarUrl: "a" }]}
        login="testuser"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("stuck pr")).toBeInTheDocument(),
    );

    const encoded = encodeURIComponent("a b&c");
    expect(
      calls.some((u) => u === `/api/stuck-prs?org=${encoded}`),
    ).toBe(true);
    expect(
      calls.some((u) => u === `/api/review-requests?org=${encoded}`),
    ).toBe(true);
    // The raw, unencoded org must never appear in a request URL.
    expect(calls.some((u) => u.includes("a b&c"))).toBe(false);
  });

  it("shows loading indicator while fetch is in-flight and hides it after resolve", async () => {
    let resolveStuck!: (val: unknown) => void;
    let resolveReview!: (val: unknown) => void;

    global.fetch = vi.fn((url: string) => {
      if (url.includes("stuck")) {
        return new Promise((resolve) => {
          resolveStuck = resolve;
        });
      }
      return new Promise((resolve) => {
        resolveReview = resolve;
      });
    }) as unknown as typeof fetch;

    render(
      <Dashboard
        orgs={[{ login: "acme", avatarUrl: "a" }]}
        login="testuser"
      />,
    );

    // Loading indicator appears while the async transition (fetch) is in-flight.
    await waitFor(() =>
      expect(screen.getByText(/loading/i)).toBeInTheDocument(),
    );

    // Resolve both fetches to complete the transition.
    resolveStuck({ ok: true, json: () => Promise.resolve([STUCK_PR]) });
    resolveReview({ ok: true, json: () => Promise.resolve([REVIEW_PR]) });

    // Loading indicator disappears once the transition settles.
    await waitFor(() =>
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
    );
  });
});
