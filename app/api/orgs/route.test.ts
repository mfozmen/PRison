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

describe("GET /api/orgs", () => {
  it("returns 401 when unauthenticated", async () => {
    getTokenMock.mockResolvedValue(null);
    const res = await GET(req("http://x/api/orgs"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when token has no accessToken", async () => {
    getTokenMock.mockResolvedValue({ login: "me" });
    const res = await GET(req("http://x/api/orgs"));
    expect(res.status).toBe(401);
  });

  it("returns parsed orgs", async () => {
    getTokenMock.mockResolvedValue({ accessToken: "t", login: "me" });
    queryMock.mockResolvedValue({
      viewer: {
        organizations: {
          nodes: [
            { login: "acme", avatarUrl: "https://example.com/avatar.png" },
          ],
        },
      },
    });
    const res = await GET(req("http://x/api/orgs"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].login).toBe("acme");
    expect(body[0].avatarUrl).toBe("https://example.com/avatar.png");
  });
});
