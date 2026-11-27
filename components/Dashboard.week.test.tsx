import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import { Dashboard } from "./Dashboard";

// The weekly look back against the real Dashboard: what it says, and that it
// asks GitHub once per half day rather than on every load.

const ORGS = [{ login: "acme", avatarUrl: "a" }];
const H = 3_600_000;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * H).toISOString();
const fact = (id: string, hoursAgo: number, waitedH: number | null) => ({
  prId: id, title: `pr ${id}`, url: `https://github.com/acme/api/pull/${id}`, repo: "acme/api",
  number: Number(id), author: "dave", submittedAt: at(hoursAgo), waitedMs: waitedH === null ? null : waitedH * H,
});
const FACTS = [fact("1", 2, 3), fact("2", 30, 48), fact("3", 50, 5), fact("4", 200, 9)];

function serve(week: unknown, ok = true) {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: url.includes("my-week") ? ok : true,
      status: ok ? 200 : 502,
      headers: { get: () => null },
      json: () => Promise.resolve(url.includes("my-week") ? week : []),
    }),
  ) as unknown as typeof fetch;
}
const card = () => screen.getByRole("region", { name: "Your reviewing" });
const weekCalls = () =>
  (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes("/api/my-week"));

beforeEach(() => localStorage.clear());

describe("Weekly look back", () => {
  it("shows the median wait, the reviews, and the longest wait with its PR", async () => {
    global.fetch = serve(FACTS);
    render(<Dashboard orgs={ORGS} login="me" />);
    await waitFor(() => expect(within(card()).getByText("reviews you gave")).toBeInTheDocument());
    expect(within(card()).getByText("5h")).toBeInTheDocument(); // median of 3h, 48h, 5h
    expect(within(card()).getByText("2d")).toBeInTheDocument(); // longest
    expect(within(card()).getByRole("link", { name: "acme/api #2 · @dave" })).toHaveAttribute(
      "href", "https://github.com/acme/api/pull/2",
    );
    expect(within(card()).getByText("was 9h the week before")).toBeInTheDocument();
  });

  it("asks once and reads the copy on the next load", async () => {
    global.fetch = serve(FACTS);
    const { unmount } = render(<Dashboard orgs={ORGS} login="me" />);
    await waitFor(() => expect(within(card()).getByText("reviews you gave")).toBeInTheDocument());
    expect(weekCalls()).toHaveLength(1);
    unmount();
    global.fetch = serve(FACTS);
    render(<Dashboard orgs={ORGS} login="me" />);
    await waitFor(() => expect(within(card()).getByText("reviews you gave")).toBeInTheDocument());
    expect(weekCalls()).toHaveLength(0);
  });

  it("says so when it can't load, without a retry button", async () => {
    global.fetch = serve([], false);
    render(<Dashboard orgs={ORGS} login="me" />);
    expect(await within(await screen.findByRole("region", { name: "Your reviewing" })).findByText(/couldn't load your reviews/i)).toBeInTheDocument();
  });
});

describe("Weekly look back — whose copy", () => {
  it("never reads another account's cached week", async () => {
    localStorage.setItem("prison.week", JSON.stringify({ login: "octocat", qs: "", at: Date.now(), facts: FACTS }));
    global.fetch = serve([]);
    render(<Dashboard orgs={ORGS} login="me" />);
    await waitFor(() => expect(weekCalls()).toHaveLength(1));
    expect(JSON.parse(localStorage.getItem("prison.week")!).login).toBe("me");
  });
});

describe("Weekly look back — your PRs", () => {
  const merged = (id: string, openedH: number, mergedH: number, reviewedH: number | null) => ({
    prId: id, title: `pr ${id}`, url: `https://github.com/acme/api/pull/${id}`, repo: "acme/api", number: Number(id),
    createdAt: at(openedH), mergedAt: at(mergedH), firstReviewAt: reviewedH === null ? null : at(reviewedH),
  });
  const serveBoth = (week: unknown, mergedFacts: unknown) =>
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        headers: { get: () => null },
        json: () => Promise.resolve(url.includes("my-merged") ? mergedFacts : url.includes("my-week") ? week : []),
      }),
    ) as unknown as typeof fetch;

  it("shows what you merged, and links a PR merged with no review", async () => {
    global.fetch = serveBoth([], [merged("7", 30, 2, 26), merged("8", 12, 4, null)]);
    render(<Dashboard orgs={ORGS} login="me" />);
    const mine = await screen.findByRole("region", { name: "Your merged PRs" });
    await waitFor(() => expect(within(mine).getByText("PRs you merged")).toBeInTheDocument());
    expect(within(mine).getByText("merged with no review")).toBeInTheDocument();
    expect(within(mine).getByRole("link", { name: "acme/api #8" })).toHaveAttribute("href", "https://github.com/acme/api/pull/8");
  });

  it("switches both cards to last week with the one picker", async () => {
    global.fetch = serveBoth(FACTS, [merged("7", 30, 2, 26), merged("9", 250, 200, 220), merged("10", 240, 190, null)]);
    render(<Dashboard orgs={ORGS} login="me" />);
    const mine = await screen.findByRole("region", { name: "Your merged PRs" });
    await waitFor(() => expect(within(mine).getByText("PRs you merged")).toBeInTheDocument());
    // This week: one merged, reviewed.
    expect(within(mine).getByText("merged with no review").previousSibling).toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: "Last week" }));
    expect(within(mine).getByText("PRs you merged").previousSibling).toHaveTextContent("2");
    expect(within(mine).getByText("merged with no review").previousSibling).toHaveTextContent("1");
    expect(within(card()).getByText("reviews you gave").previousSibling).toHaveTextContent("1");
  });

  it("says when your merged PRs could not load, and keeps the reviewing card", async () => {
    global.fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: !url.includes("my-merged"),
        status: url.includes("my-merged") ? 502 : 200,
        headers: { get: () => null },
        json: () => Promise.resolve(url.includes("my-week") ? FACTS : []),
      }),
    ) as unknown as typeof fetch;
    render(<Dashboard orgs={ORGS} login="me" />);
    const mine = await screen.findByRole("region", { name: "Your merged PRs" });
    expect(await within(mine).findByText(/couldn't load your merged PRs/i)).toBeInTheDocument();
    expect(within(card()).getByText("reviews you gave")).toBeInTheDocument();
  });

  it("says plainly when there is nothing to show, instead of a grid of zeros", async () => {
    global.fetch = serveBoth([], []);
    render(<Dashboard orgs={ORGS} login="me" />);
    expect(await within(card()).findByText("No reviews in the last two weeks.")).toBeInTheDocument();
    expect(within(card()).queryByText("reviews you gave")).not.toBeInTheDocument();
  });
});
