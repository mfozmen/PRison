import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { Dashboard } from "./Dashboard";

// Snooze against the real Dashboard: a row leaves its queue, waits folded at
// the foot of the column, and comes back on Wake or when it changes.

const ORGS = [{ login: "acme", avatarUrl: "a" }];
const review = (over: Record<string, unknown> = {}) => ({
  id: "v1", title: "migrate sessions", url: "https://github.com/acme/web/pull/9",
  repo: "acme/web", number: 9, author: "dave", isDraft: false,
  requestedAt: "2026-11-18T09:00:00Z", requestedDirectly: true, ...over,
});

function serve(reviews: unknown[]) {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      headers: { get: () => null },
      json: () =>
        Promise.resolve(url.includes("review-requests") ? reviews : []),
    }),
  ) as unknown as typeof fetch;
}

const column = () => document.getElementById("waiting-on-your-review")!;
const rows = () => within(column()).queryAllByRole("link", { name: /^Open migrate sessions/ });

async function snoozeUntil(label: string) {
  fireEvent.click(await within(column()).findByRole("button", { name: "Snooze migrate sessions" }));
  fireEvent.click(within(column()).getByRole("menuitem", { name: label }));
}

async function refresh() {
  const button = screen.getByRole("button", { name: /^refresh$/i });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

beforeEach(() => localStorage.clear());

describe("Snooze", () => {
  it("takes a row off its queue and keeps it folded at the foot of the column", async () => {
    global.fetch = serve([review()]);
    render(<Dashboard orgs={ORGS} login="me" />);
    await snoozeUntil("Until it changes");
    expect(rows()).toHaveLength(0);
    expect(within(column()).getByTestId("count-badge")).toHaveTextContent("0");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nothing wants you");
    expect(within(column()).getByText("Snoozed")).toBeInTheDocument();
    expect(within(column()).getByText(/wakes when it changes/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("prison.snoozes")!)).toEqual({
      v1: { kind: "change", mark: "2026-11-18T09:00:00Z" },
    });
  });

  it("comes back on Wake", async () => {
    global.fetch = serve([review()]);
    render(<Dashboard orgs={ORGS} login="me" />);
    await snoozeUntil("Tomorrow, 9:00");
    fireEvent.click(within(column()).getByRole("button", { name: "Wake migrate sessions" }));
    expect(rows()).toHaveLength(1);
    expect(within(column()).queryByText("Snoozed")).toBeNull();
  });

  it("wakes by itself when the item changes", async () => {
    global.fetch = serve([review()]);
    render(<Dashboard orgs={ORGS} login="me" />);
    await snoozeUntil("Until it changes");
    expect(rows()).toHaveLength(0);
    // Re-requested: the request time moves, which is a change.
    global.fetch = serve([review({ requestedAt: "2026-11-19T09:00:00Z" })]);
    await refresh();
    await waitFor(() => expect(rows()).toHaveLength(1));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("prison.snoozes")!)).toEqual({}));
  });

  it("keeps a snooze across a reload", async () => {
    localStorage.setItem("prison.snoozes", JSON.stringify({ v1: { kind: "time", until: "2999-01-01T09:00:00Z" } }));
    global.fetch = serve([review()]);
    render(<Dashboard orgs={ORGS} login="me" />);
    expect(await within(column()).findByText("Snoozed")).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });
});
