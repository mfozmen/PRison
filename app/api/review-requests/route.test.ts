import { describe, it, expect, vi, beforeEach } from "vitest";

const { getTokenMock, queryMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({ getToken: getTokenMock }));
vi.mock("@/lib/github/client", () => ({ ghClient: () => queryMock }));

import { GET } from "./route";

function req(url: string) {
  return new Request(url);
}

beforeEach(() => {
  getTokenMock.mockReset();
  queryMock.mockReset();
});

describe("GET /api/review-requests", () => {
  it("returns 401 when unauthenticated", async () => {
    getTokenMock.mockResolvedValue(null);
    const res = await GET(req("http://x/api/review-requests?org=acme"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when token has no accessToken", async () => {
    getTokenMock.mockResolvedValue({ login: "me" });
    const res = await GET(req("http://x/api/review-requests?org=acme"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org is missing", async () => {
    getTokenMock.mockResolvedValue({ accessToken: "t", login: "me" });
    const res = await GET(req("http://x/api/review-requests"));
    expect(res.status).toBe(400);
  });

  it("returns parsed review requests", async () => {
    getTokenMock.mockResolvedValue({ accessToken: "t", login: "me" });
    queryMock.mockResolvedValue({
      search: {
        nodes: [
          {
            id: "3",
            title: "needs review",
            url: "u3",
            number: 3,
            updatedAt: "2026-06-21T00:00:00Z",
            repository: { nameWithOwner: "acme/c" },
            author: { login: "alice" },
            timelineItems: {
              nodes: [
                {
                  createdAt: "2026-06-21T00:00:00Z",
                  requestedReviewer: { login: "me" },
                },
              ],
            },
          },
        ],
      },
    });
    const res = await GET(req("http://x/api/review-requests?org=acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].author).toBe("alice");
    expect(body[0].requestedAt).toBe("2026-06-21T00:00:00Z");
  });
});
