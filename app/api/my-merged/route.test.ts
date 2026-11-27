import { describe, it, expect, vi, beforeEach } from "vitest";

const { readTokenMock, queryMock } = vi.hoisted(() => ({
  readTokenMock: vi.fn(),
  queryMock: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ readToken: readTokenMock }));
vi.mock("@/lib/github/client", () => ({ ghQuery: queryMock }));

import { GET } from "./route";

beforeEach(() => {
  readTokenMock.mockReset();
  queryMock.mockReset();
});

describe("GET /api/my-merged", () => {
  it("returns 401 without a token", async () => {
    readTokenMock.mockResolvedValue(null);
    expect((await GET(new Request("http://x/api/my-merged"))).status).toBe(401);
  });

  it("asks for two weeks of your merged PRs in the scope", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({
      data: { search: { nodes: [{
        id: "PR_1", title: "t", url: "u", number: 1, repository: { nameWithOwner: "acme/api" },
        author: { login: "me" }, createdAt: "2026-11-10T09:00:00Z", mergedAt: "2026-11-11T09:00:00Z",
        reviews: { nodes: [] },
      }] }, rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-11-20T10:00:00Z" } },
      partial: false,
    });
    const res = await GET(new Request("http://x/api/my-merged?org=acme"));
    const q: string = queryMock.mock.calls[0][2].q;
    expect(q).toMatch(/^is:pr author:@me is:merged merged:>=\d{4}-\d{2}-\d{2} org:acme/);
    expect(await res.json()).toEqual([expect.objectContaining({ prId: "PR_1", firstReviewAt: null })]);
  });
});
