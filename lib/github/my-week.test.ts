import { describe, it, expect } from "vitest";
import { parseMyWeek, myWeekSearch, MY_WEEK_QUERY, parseMyMerged } from "./queries";

const node = (over: Record<string, unknown> = {}) => ({
  id: "PR_1", title: "Add an audit log", url: "u", number: 7,
  repository: { nameWithOwner: "acme/api" }, author: { login: "alice" },
  reviews: { nodes: [] }, timelineItems: { nodes: [] }, ...over,
});

describe("parseMyWeek", () => {
  it("reads every review the viewer submitted, with the wait since the request it answered", () => {
    const facts = parseMyWeek({ search: { nodes: [node({
      timelineItems: { nodes: [
        { createdAt: "2026-11-10T09:00:00Z", requestedReviewer: { login: "me" } },
        { createdAt: "2026-11-12T09:00:00Z", requestedReviewer: { login: "me" } },
        { createdAt: "2026-11-11T09:00:00Z", requestedReviewer: { login: "bob" } },
      ] },
      reviews: { nodes: [
        { submittedAt: "2026-11-10T14:00:00Z", author: { login: "me" } },
        { submittedAt: "2026-11-11T10:00:00Z", author: { login: "bob" } },
        { submittedAt: "2026-11-13T09:00:00Z", author: { login: "me" } },
      ] },
    })] } }, "me");
    expect(facts.map((f) => [f.submittedAt, f.waitedMs])).toEqual([
      ["2026-11-10T14:00:00Z", 5 * 3_600_000],
      ["2026-11-13T09:00:00Z", 24 * 3_600_000],
    ]);
    expect(facts[0]).toMatchObject({ prId: "PR_1", repo: "acme/api", author: "alice" });
  });

  it("has no wait for a review nobody asked for", () => {
    const [f] = parseMyWeek({ search: { nodes: [node({
      reviews: { nodes: [{ submittedAt: "2026-11-13T09:00:00Z", author: { login: "me" } }] },
    })] } }, "me");
    expect(f.waitedMs).toBeNull();
    expect(parseMyWeek({}, "me")).toEqual([]);
  });

  it("searches two weeks of the viewer's reviews on other people's PRs", () => {
    expect(myWeekSearch("2026-11-06", "org:acme")).toBe(
      "is:pr reviewed-by:@me -author:@me updated:>=2026-11-06 org:acme sort:updated-desc",
    );
    expect(MY_WEEK_QUERY).toContain("REVIEW_REQUESTED_EVENT");
  });
});

describe("parseMyMerged", () => {
  const pr = (over: Record<string, unknown> = {}) => ({
    id: "PR_2", title: "Ship it", url: "u", number: 8,
    repository: { nameWithOwner: "acme/api" }, author: { login: "me" },
    createdAt: "2026-11-10T09:00:00Z", mergedAt: "2026-11-12T09:00:00Z",
    reviews: { nodes: [] }, ...over,
  });

  it("dates the first review by someone else, ignoring your own notes", () => {
    const [f] = parseMyMerged({ search: { nodes: [pr({ reviews: { nodes: [
      { submittedAt: "2026-11-10T10:00:00Z", author: { login: "me" } },
      { submittedAt: "2026-11-11T12:00:00Z", author: { login: "bob" } },
      { submittedAt: "2026-11-11T09:00:00Z", author: { login: "alice" } },
    ] } })] } });
    expect(f).toMatchObject({ prId: "PR_2", repo: "acme/api", firstReviewAt: "2026-11-11T09:00:00Z" });
  });

  it("has no first review for a PR merged without one, and skips unmerged rows", () => {
    const facts = parseMyMerged({ search: { nodes: [pr(), pr({ id: "PR_3", mergedAt: null })] } });
    expect(facts.map((f) => [f.prId, f.firstReviewAt])).toEqual([["PR_2", null]]);
  });
});
