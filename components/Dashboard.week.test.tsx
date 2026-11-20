import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
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
const card = () => screen.getByRole("region", { name: /this week|last week/i });
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
    expect(await within(await screen.findByRole("region", { name: /this week/i })).findByText(/couldn't load your reviews/i)).toBeInTheDocument();
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
