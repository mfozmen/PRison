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

function req(url: string) {
  return new Request(url);
}

const STUCK_RAW = {
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
                  contexts: { nodes: [{ conclusion: "FAILURE" }] },
                },
              },
            },
          ],
        },
      },
    ],
  },
};

beforeEach(() => {
  readTokenMock.mockReset();
  queryMock.mockReset();
});

describe("GET /api/stuck-prs", () => {
  it("returns 401 when there is no token", async () => {
    readTokenMock.mockResolvedValue(null);
    const res = await GET(req("http://x/api/stuck-prs"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org contains invalid characters", async () => {
    readTokenMock.mockResolvedValue("t");
    const res = await GET(req("http://x/api/stuck-prs?org=acme+repo%3Ax%2Fy"));
    expect(res.status).toBe(400);
  });

  it("returns parsed stuck PRs scoped to an org", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue(STUCK_RAW);
    const res = await GET(req("http://x/api/stuck-prs?org=acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].failingChecks).toBe(1);
    expect(queryMock.mock.calls[0][2].q).toBe("is:open is:pr author:@me org:acme");
  });

  it("spans everything (no org scope) when org is omitted", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue(STUCK_RAW);
    const res = await GET(req("http://x/api/stuck-prs"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toBe("is:open is:pr author:@me");
  });

  it("returns 502 when GitHub API throws", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockRejectedValue(new Error("network error"));
    const res = await GET(req("http://x/api/stuck-prs?org=acme"));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream GitHub error");
  });

  it("returns parsed stuck PRs scoped to a personal account (?user=mfozmen)", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue(STUCK_RAW);
    const res = await GET(req("http://x/api/stuck-prs?user=mfozmen"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toBe("is:open is:pr author:@me user:mfozmen");
  });

  it("returns 400 when user contains invalid characters", async () => {
    readTokenMock.mockResolvedValue("t");
    const res = await GET(req("http://x/api/stuck-prs?user=invalid+char"));
    expect(res.status).toBe(400);
  });

  it("user wins over org when both are present", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue(STUCK_RAW);
    const res = await GET(req("http://x/api/stuck-prs?org=acme&user=mfozmen"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toContain("user:mfozmen");
    expect(queryMock.mock.calls[0][2].q).not.toContain("org:acme");
  });
});
