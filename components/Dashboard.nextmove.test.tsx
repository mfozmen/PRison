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

// Refresh is disabled while a load is in flight, and a click on it then is a
// no-op, so wait for it to be live first.
async function refresh() {
  const button = screen.getByRole("button", { name: /^refresh$/i });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

const strip = () => screen.getByRole("region", { name: "Next move" });

beforeEach(() => {
  localStorage.clear();
});

describe("Dashboard — Next move", () => {
  it("points at the longest wait among the queues where a teammate waits on you", async () => {
    global.fetch = fetchLists([STUCK_PR], [REVIEW_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await within(await screen.findByRole("region", { name: "Next move" })).findByText("review pr")).toBeInTheDocument();
    expect(within(strip()).getByText("blocking @alice")).toBeInTheDocument();
  });

  it("puts a blocked teammate before your own PR, even an older one", async () => {
    const olderStuck = { ...STUCK_PR, stuckSince: "2026-06-01T00:00:00Z" };
    global.fetch = fetchLists([olderStuck], [REVIEW_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await within(await screen.findByRole("region", { name: "Next move" })).findByText("review pr")).toBeInTheDocument();
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
    expect(within(strip()).getByText("build")).toBeInTheDocument();
    expect(within(strip()).getByText(/2 of 2/)).toBeInTheDocument();
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
    await refresh();
    await waitFor(() => expect(document.getElementById("waiting-on-your-review")!.querySelector('[data-testid="count-badge"]')).toHaveTextContent("0"));

    // …then is requested again: it is the oldest, and nobody skipped it this time.
    global.fetch = fetchLists([STUCK_PR], [REVIEW_PR]);
    await refresh();
    expect(await within(strip()).findByText("review pr")).toBeInTheDocument();
  });

  it("names its queue and where it sits in the round", async () => {
    global.fetch = fetchLists([STUCK_PR], [REVIEW_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await screen.findByRole("region", { name: "Next move" });
    expect(within(strip()).getByText(/WAITING ON YOUR REVIEW/)).toBeInTheDocument();
    expect(within(strip()).getByText(/1 of 2/)).toBeInTheDocument();
  });

  it.each([
    ["moving", 2 * 60 * 60 * 1000, 1],
    ["slowing", 2 * 24 * 60 * 60 * 1000, 2],
    ["stalled", 5 * 24 * 60 * 60 * 1000, 3],
  ])("calls a wait %s and fills its meter, never by colour alone", async (word, ageMs, steps) => {
    const since = new Date(Date.now() - ageMs).toISOString();
    global.fetch = fetchLists([{ ...STUCK_PR, stuckSince: since }], []);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    const card = await screen.findByRole("region", { name: "Next move" });
    expect(card).toHaveAttribute("data-pace", word);
    expect(card).toHaveClass(`nm-pace-${word}`);
    expect(within(card).getByRole("img", { name: `Pace: ${word}` })).toBeInTheDocument();
    const meter = within(card).getByRole("img", { name: `Pace: ${word}` });
    expect(meter.querySelectorAll(".bg-background")).toHaveLength(steps);
    expect(within(card).getByText(new RegExp(`${word} · 1 of 1`))).toBeInTheDocument();
  });

  it("wears its queue's colour on the card, whatever the pace", async () => {
    global.fetch = fetchLists([STUCK_PR], [REVIEW_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    expect(await screen.findByRole("region", { name: "Next move" })).toHaveClass("nm-tone-accent");
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

describe("Dashboard — Next move fits the time you have", () => {
  const timeGroup = () => within(strip()).getByRole("group", { name: "Time you have" });

  it("picks the longest wait that fits, and says it is one of those that fit", async () => {
    // The review is older but unmeasured, so it counts as long; the stuck PR's
    // red check is a quick re-run.
    global.fetch = fetchLists([STUCK_PR], [REVIEW_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await screen.findByRole("region", { name: "Next move" });
    expect(within(strip()).getByText("review pr")).toBeInTheDocument();
    fireEvent.click(within(timeGroup()).getByRole("button", { name: "15 min" }));
    expect(within(strip()).getByText("stuck pr")).toBeInTheDocument();
    expect(within(strip()).getByText(/1 of 1\s*that fit/)).toBeInTheDocument();
    expect(localStorage.getItem("prison.timeBudget")).toBe("15");
    fireEvent.click(within(timeGroup()).getByRole("button", { name: "Any" }));
    expect(within(strip()).getByText("review pr")).toBeInTheDocument();
  });

  it("shows a review's size on the card and its row, and fits it by that size", async () => {
    const small = { ...REVIEW_PR, additions: 3, deletions: 1, changedFiles: 1 };
    global.fetch = fetchLists([STUCK_PR], [small]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await screen.findByRole("region", { name: "Next move" });
    fireEvent.click(within(timeGroup()).getByRole("button", { name: "5 min" }));
    expect(within(strip()).getByText("review pr")).toBeInTheDocument();
    expect(within(strip()).getByText("~5 min · 4 lines · 1 file")).toBeInTheDocument();
    const column = document.getElementById("waiting-on-your-review")!;
    expect(within(column).getByText("~5 min · 4 lines · 1 file")).toBeInTheDocument();
  });

  it("falls back to the longest wait, and says so, when nothing fits", async () => {
    global.fetch = fetchLists([], [REVIEW_PR]);
    render(<Dashboard orgs={ORGS} login="testuser" />);
    await screen.findByRole("region", { name: "Next move" });
    fireEvent.click(within(timeGroup()).getByRole("button", { name: "5 min" }));
    expect(within(strip()).getByText("review pr")).toBeInTheDocument();
    expect(within(strip()).getByText(/nothing fits that/i)).toBeInTheDocument();
  });
});
