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

describe("GET /api/stuck-prs", () => {
  it("returns 401 when unauthenticated", async () => {
    getTokenMock.mockResolvedValue(null);
    const res = await GET(req("http://x/api/stuck-prs?org=acme"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when token has no accessToken", async () => {
    getTokenMock.mockResolvedValue({ login: "me" });
    const res = await GET(req("http://x/api/stuck-prs?org=acme"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org is missing", async () => {
    getTokenMock.mockResolvedValue({ accessToken: "t", login: "me" });
    const res = await GET(req("http://x/api/stuck-prs"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when org contains invalid characters", async () => {
    getTokenMock.mockResolvedValue({ accessToken: "t", login: "me" });
    const res = await GET(req("http://x/api/stuck-prs?org=acme+repo%3Ax%2Fy"));
    expect(res.status).toBe(400);
  });

  it("returns parsed stuck PRs", async () => {
    getTokenMock.mockResolvedValue({ accessToken: "t", login: "me" });
    queryMock.mockResolvedValue({
      search: {
        nodes: [
          {
            id: "2",
            title: "stuck",
            url: "u2",
            number: 2,
            repository: { nameWithOwner: "acme/b" },
            commits: {
              nodes: [
                {
                  commit: {
                    pushedDate: "2026-06-20T00:00:00Z",
                    statusCheckRollup: {
                      contexts: {
                        nodes: [{ conclusion: "FAILURE" }],
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });
    const res = await GET(req("http://x/api/stuck-prs?org=acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].failingChecks).toBe(1);
  });

  it("returns 502 when GitHub API throws", async () => {
    getTokenMock.mockResolvedValue({ accessToken: "t", login: "me" });
    queryMock.mockRejectedValue(new Error("network error"));
    const res = await GET(req("http://x/api/stuck-prs?org=acme"));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toBe("Upstream GitHub error");
  });
});
