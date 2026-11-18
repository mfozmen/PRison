import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { Dashboard } from "./Dashboard";

// The Next move strip against the real Dashboard. Dashboard.test.tsx stubs the
// strip out (it repeats a title, which every getByText there would trip on), so
// how the board picks, marks and skips lives here.

const STUCK_PR = {
  id: "s1",
  title: "stuck pr",
  url: "https://github.com/acme/b/pull/2",
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
  stuckSince: "2026-06-22T00:00:00Z",
};

const REVIEW_PR = {
  id: "v1",
  title: "review pr",
  url: "https://github.com/acme/c/pull/9",
  repo: "acme/c",
  number: 9,
  author: "alice",
  isDraft: false,
  // Older than the stuck PR, so it is the Next move.
  requestedAt: "2026-06-20T00:00:00Z",
};

const ORGS = [{ login: "acme", avatarUrl: "a" }];

function fetchLists(stuck: unknown[], reviews: unknown[]) {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      headers: { get: () => null },
      json: () =>
        Promise.resolve(
          url.includes("reviewed") || url.includes("closed") || url.includes("pr-comments") || url.includes("ready")
            ? []
            : url.includes("stuck")
              ? stuck
              : reviews,
        ),
    }),
  ) as unknown as typeof fetch;
}

const strip = () => screen.getByRole("region", { name: "Next move" });

beforeEach(() => {
  localStorage.clear();
});

describe("Dashboard — Next move", () => {
  it("points at the longest wait across the queues, whichever queue it is in", async () => {
    global.fetch = fetchLists([STUCK_PR], [REVIEW_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await within(await screen.findByRole("region", { name: "Next move" })).findByText("review pr")).toBeInTheDocument();
    expect(within(strip()).getByText("blocking @alice")).toBeInTheDocument();
  });

  it("highlights the column the item sits in and marks the row there", async () => {
    global.fetch = fetchLists([STUCK_PR], [REVIEW_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await screen.findByRole("region", { name: "Next move" });
    const review = document.getElementById("waiting-on-your-review")!;
    const stuck = document.getElementById("stuck-on-checks")!;
    expect(review).toHaveAttribute("data-highlighted", "true");
    expect(stuck).not.toHaveAttribute("data-highlighted");
    expect(within(review).getByText(/next move/i)).toBeInTheDocument();
  });

  it("steps to the next oldest on Skip, and wraps after the last", async () => {
    global.fetch = fetchLists([STUCK_PR], [REVIEW_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await screen.findByRole("region", { name: "Next move" });

    fireEvent.click(within(strip()).getByRole("button", { name: /skip/i }));
    expect(within(strip()).getByText("stuck pr")).toBeInTheDocument();
    expect(within(strip()).getByText("✗ build")).toBeInTheDocument();
    expect(document.getElementById("stuck-on-checks")).toHaveAttribute("data-highlighted", "true");

    fireEvent.click(within(strip()).getByRole("button", { name: /skip/i }));
    expect(within(strip()).getByText("review pr")).toBeInTheDocument();
  });

  it("forgets a skip once its item leaves the board, so it comes back unskipped", async () => {
    global.fetch = fetchLists([STUCK_PR], [REVIEW_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await screen.findByRole("region", { name: "Next move" });
    fireEvent.click(within(strip()).getByRole("button", { name: /skip/i }));
    expect(within(strip()).getByText("stuck pr")).toBeInTheDocument();

    // The review is answered elsewhere and drops off the board…
    global.fetch = fetchLists([STUCK_PR], []);
    fireEvent.click(screen.getByRole("button", { name: /^refresh$/i }));
    await waitFor(() => expect(document.getElementById("waiting-on-your-review")!.querySelector('[data-testid="count-badge"]')).toHaveTextContent("0"));

    // …then is requested again: it is the oldest, and nobody skipped it this time.
    global.fetch = fetchLists([STUCK_PR], [REVIEW_PR]);
    fireEvent.click(screen.getByRole("button", { name: /^refresh$/i }));
    expect(await within(strip()).findByText("review pr")).toBeInTheDocument();
  });

  it("offers no Skip when there is only one thing to do", async () => {
    global.fetch = fetchLists([STUCK_PR], []);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await screen.findByRole("region", { name: "Next move" });
    expect(within(strip()).queryByRole("button", { name: /skip/i })).toBeNull();
  });

  it("disappears when nothing wants you", async () => {
    global.fetch = fetchLists([], []);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Nothing wants you" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Next move" })).toBeNull();
  });
});
