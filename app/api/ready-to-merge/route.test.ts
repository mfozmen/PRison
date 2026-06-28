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

const READY_RAW = {
  search: {
    nodes: [
      {
        id: "1",
        title: "ready",
        url: "https://github.com/acme/b/pull/1",
        number: 1,
        reviewDecision: "APPROVED",
        isDraft: false,
        repository: { nameWithOwner: "acme/b" },
        commits: {
          nodes: [
            {
              commit: {
                pushedDate: "2026-06-25T00:00:00Z",
                statusCheckRollup: { state: "SUCCESS" },
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

describe("GET /api/ready-to-merge", () => {
  it("returns 401 when there is no token", async () => {
    readTokenMock.mockResolvedValue(null);
    const res = await GET(req("http://x/api/ready-to-merge"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org contains invalid characters", async () => {
    readTokenMock.mockResolvedValue("t");
    const res = await GET(req("http://x/api/ready-to-merge?org=acme+repo%3Ax%2Fy"));
    expect(res.status).toBe(400);
  });

  it("returns parsed ready PRs scoped to an org", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue(READY_RAW);
    const res = await GET(req("http://x/api/ready-to-merge?org=acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].readySince).toBe("2026-06-25T00:00:00Z");
    expect(queryMock.mock.calls[0][2].q).toBe(
      "is:open is:pr author:@me review:approved org:acme",
    );
  });

  it("spans everything (no org scope) when org is omitted", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue(READY_RAW);
    const res = await GET(req("http://x/api/ready-to-merge"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toBe(
      "is:open is:pr author:@me review:approved",
    );
  });

  it("returns 502 when GitHub API throws", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockRejectedValue(new Error("network error"));
    const res = await GET(req("http://x/api/ready-to-merge?org=acme"));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream GitHub error");
  });
});
