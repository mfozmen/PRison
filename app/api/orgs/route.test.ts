import { describe, it, expect, vi, beforeEach } from "vitest";

const { readTokenMock, queryMock } = vi.hoisted(() => ({
  readTokenMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  readToken: readTokenMock,
  readLogin: vi.fn(),
}));
vi.mock("@/lib/github/client", () => ({ ghQuery: queryMock }));

import { GET } from "./route";

beforeEach(() => {
  readTokenMock.mockReset();
  queryMock.mockReset();
});

describe("GET /api/orgs", () => {
  it("returns 401 when there is no token", async () => {
    readTokenMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns parsed orgs", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({
      viewer: {
        organizations: {
          nodes: [{ login: "acme", avatarUrl: "https://example.com/a.png" }],
        },
      },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].login).toBe("acme");
  });

  it("returns 502 when GitHub API throws", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockRejectedValue(new Error("network error"));
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream GitHub error");
  });
});
