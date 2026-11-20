import { describe, it, expect, vi, beforeEach } from "vitest";

const { readTokenMock, queryMock } = vi.hoisted(() => ({
  readTokenMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ readToken: readTokenMock }));
vi.mock("@/lib/github/client", () => ({ ghQuery: queryMock }));

import { GET } from "./route";

const RAW = {
  search: {
    nodes: [{
      id: "PR_1", title: "Add an audit log", url: "u1", number: 1, isDraft: false,
      createdAt: "2026-11-10T09:00:00Z", repository: { nameWithOwner: "acme/api" },
      author: { login: "me" },
      reviewRequests: { nodes: [{ requestedReviewer: { __typename: "User", login: "alice" } }] },
      timelineItems: { nodes: [] }, latestReviews: { nodes: [] }, commits: { nodes: [] },
    }],
  },
  rateLimit: { cost: 2, remaining: 4990, resetAt: "2026-11-20T10:00:00Z" },
};

beforeEach(() => {
  readTokenMock.mockReset();
  queryMock.mockReset();
});

describe("GET /api/awaiting-reviewers", () => {
  it("returns 401 without a token", async () => {
    readTokenMock.mockResolvedValue(null);
    expect((await GET(new Request("http://x/api/awaiting-reviewers"))).status).toBe(401);
  });

  it("searches the viewer's own open PRs in the scope and prices the answer", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: RAW, partial: false });
    const res = await GET(new Request("http://x/api/awaiting-reviewers?org=acme"));
    expect(queryMock.mock.calls[0][2]).toEqual({ q: "is:open is:pr author:@me org:acme" });
    expect(res.headers.get("X-Cost")).toBe("2");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].reviewers[0]).toMatchObject({ name: "alice", state: "requested" });
  });

  it("rejects a bad scope", async () => {
    readTokenMock.mockResolvedValue("t");
    expect((await GET(new Request("http://x/api/awaiting-reviewers?org=bad%20org"))).status).toBe(400);
  });
});
