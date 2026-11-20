import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { Dashboard } from "./Dashboard";

// The "Waiting on others" column against the real Dashboard: which of the
// viewer's PRs land in it, which stay in their own list, and what it says.

const ORGS = [{ login: "acme", avatarUrl: "a" }];
const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

const stuck = (over: Record<string, unknown> = {}) => ({
  id: "s1", title: "held by a review", url: "https://github.com/acme/api/pull/1",
  repo: "acme/api", number: 1, failingChecks: 0, pendingChecks: 0, failing: [], pending: [],
  checkNames: [], isDraft: false, blocked: true, readyViaBlocked: false,
  reviewDecision: "REVIEW_REQUIRED", mergeState: "BLOCKED", unresolvedThreads: 0,
  stuckSince: ago(30), ...over,
});
const awaiting = (over: Record<string, unknown> = {}) => ({
  id: "s1", title: "held by a review", url: "https://github.com/acme/api/pull/1",
  number: 1, repo: "acme/api", isDraft: false, waitingSince: ago(72),
  reviewers: [
    { name: "alice", team: false, state: "requested", since: ago(72) },
    { name: "dave", team: false, state: "approved", since: ago(10) },
  ],
  ...over,
});

function serve(lists: { stuck?: unknown[]; ready?: unknown[]; awaiting?: unknown[] }) {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      headers: { get: () => null },
      json: () =>
        Promise.resolve(
          url.includes("awaiting-reviewers") ? (lists.awaiting ?? [])
          : url.includes("stuck") ? (lists.stuck ?? [])
          : url.includes("ready-to-merge") ? (lists.ready ?? [])
          : [],
        ),
    }),
  ) as unknown as typeof fetch;
}

// Columns are found by their anchor id, which the jump links use too.
const byId = (id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`no #${id}`);
  return el;
};
const column = () => byId("waiting-on-others");
const stuckColumn = () => byId("stuck-on-checks");

beforeEach(() => localStorage.clear());

describe("Waiting on others", () => {
  it("moves a PR held only by a review out of Stuck and says who it waits on", async () => {
    global.fetch = serve({ stuck: [stuck()], awaiting: [awaiting()] });
    render(<Dashboard orgs={ORGS} login="me" />);
    await waitFor(() => expect(within(column()).getByText("held by a review")).toBeInTheDocument());
    expect(within(stuckColumn()).queryByText("held by a review")).toBeNull();
    const reviewers = within(column()).getByRole("list", { name: "Reviewers" });
    expect(within(reviewers).getByText("@alice")).toBeInTheDocument();
    expect(within(reviewers).getByText(/no review yet · 3d/)).toBeInTheDocument();
    expect(within(reviewers).getByText("approved")).toBeInTheDocument();
  });

  it("leaves a PR with a red check in Stuck, where the author's move is", async () => {
    global.fetch = serve({
      stuck: [stuck({ failingChecks: 1, failing: ["lint"], checkNames: ["lint"] })],
      awaiting: [awaiting()],
    });
    render(<Dashboard orgs={ORGS} login="me" />);
    await waitFor(() => expect(within(stuckColumn()).getByText("held by a review")).toBeInTheDocument());
    expect(within(column()).queryByText("held by a review")).toBeNull();
  });

  it("does not repeat a PR that is ready to merge", async () => {
    global.fetch = serve({
      ready: [{ id: "s1", title: "held by a review", url: "u", number: 1, repo: "acme/api",
        readySince: ago(5), needsUpdate: false, checkNames: [], viaBlocked: false }],
      awaiting: [awaiting()],
    });
    render(<Dashboard orgs={ORGS} login="me" />);
    expect(await within(byId("ready-to-merge")).findByText("held by a review")).toBeInTheDocument();
    await waitFor(() => expect(within(column()).getByText(/none of your prs is waiting/i)).toBeInTheDocument());
  });

  it("is not counted as something that wants you", async () => {
    global.fetch = serve({ awaiting: [awaiting({ id: "a2", title: "only waiting" })] });
    render(<Dashboard orgs={ORGS} login="me" />);
    await waitFor(() => expect(within(column()).getByText("only waiting")).toBeInTheDocument());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nothing wants you");
    expect(screen.queryByRole("region", { name: "Next move" })).toBeNull();
  });

  it("copies a polite reminder naming the reviewer it waits on", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    global.fetch = serve({ awaiting: [awaiting()] });
    render(<Dashboard orgs={ORGS} login="me" />);
    await waitFor(() => expect(within(column()).getByRole("button", { name: "Copy reminder" })).toBeInTheDocument());
    fireEvent.click(within(column()).getByRole("button", { name: "Copy reminder" }));
    expect(writeText).toHaveBeenCalledWith(
      "Hi @alice, when you get a moment, could you take a look at acme/api#1 (held by a review)? It's been waiting 3 days. Thanks!",
    );
    expect(await within(column()).findByText(/copied/i)).toBeInTheDocument();
  });
});

describe("Wait limits on the board", () => {
  it("says how late a row is, counts it in the heading, and names the limit on the column", async () => {
    localStorage.setItem("prison.limits", JSON.stringify({ others: 24 }));
    global.fetch = serve({ awaiting: [awaiting()] });
    render(<Dashboard orgs={ORGS} login="me" />);
    await waitFor(() => expect(within(column()).getByText("Late · 2d over")).toBeInTheDocument());
    expect(screen.getByText("1 late")).toBeInTheDocument();
    expect(within(column()).getByText(/limit 1 day/)).toBeInTheDocument();
  });

  it("stays quiet with no limit set", async () => {
    global.fetch = serve({ awaiting: [awaiting()] });
    render(<Dashboard orgs={ORGS} login="me" />);
    await waitFor(() => expect(within(column()).getByText("held by a review")).toBeInTheDocument());
    expect(screen.queryByText(/late/i)).toBeNull();
  });
});
