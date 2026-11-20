import { describe, it, expect, vi, beforeEach } from "vitest";

const { readTokenMock, readLoginMock, queryMock } = vi.hoisted(() => ({
  readTokenMock: vi.fn(),
  readLoginMock: vi.fn(),
  queryMock: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ readToken: readTokenMock, readLogin: readLoginMock }));
vi.mock("@/lib/github/client", () => ({ ghQuery: queryMock }));

import { GET } from "./route";

beforeEach(() => {
  readTokenMock.mockReset();
  readLoginMock.mockReset();
  queryMock.mockReset();
});

describe("GET /api/my-week", () => {
  it("returns 401 without a token or a login", async () => {
    readTokenMock.mockResolvedValue(null);
    expect((await GET(new Request("http://x/api/my-week"))).status).toBe(401);
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue(null);
    expect((await GET(new Request("http://x/api/my-week"))).status).toBe(401);
  });

  it("asks for two weeks in the scope and returns the viewer's reviews", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("me");
    queryMock.mockResolvedValue({
      data: { search: { nodes: [{
        id: "PR_1", title: "t", url: "u", number: 1, repository: { nameWithOwner: "acme/api" },
        author: { login: "alice" }, timelineItems: { nodes: [] },
        reviews: { nodes: [{ submittedAt: "2026-11-13T09:00:00Z", author: { login: "me" } }] },
      }] }, rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-11-20T10:00:00Z" } },
      partial: false,
    });
    const res = await GET(new Request("http://x/api/my-week?org=acme"));
    const q: string = queryMock.mock.calls[0][2].q;
    expect(q).toMatch(/^is:pr reviewed-by:@me -author:@me updated:>=\d{4}-\d{2}-\d{2} org:acme sort:updated-desc$/);
    expect(await res.json()).toHaveLength(1);
  });
});
