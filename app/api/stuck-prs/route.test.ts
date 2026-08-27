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
    queryMock.mockResolvedValue({ data: STUCK_RAW, partial: false });
    const res = await GET(req("http://x/api/stuck-prs?org=acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].failingChecks).toBe(1);
    expect(queryMock.mock.calls[0][2].q).toBe("is:open is:pr author:@me org:acme");
  });

  it("spans everything (no org scope) when org is omitted", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: STUCK_RAW, partial: false });
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
    queryMock.mockResolvedValue({ data: STUCK_RAW, partial: false });
    const res = await GET(req("http://x/api/stuck-prs?user=mfozmen"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toBe("is:open is:pr author:@me user:mfozmen");
  });

  it("returns 400 when user contains invalid characters", async () => {
    readTokenMock.mockResolvedValue("t");
    const res = await GET(req("http://x/api/stuck-prs?user=invalid+char"));
    expect(res.status).toBe(400);
  });

  it("sets X-Partial header when ghQuery reports partial data", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: STUCK_RAW, partial: true });
    const res = await GET(req("http://x/api/stuck-prs?org=acme"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Partial")).toBe("1");
  });

  it("omits X-Partial header when data is complete", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: STUCK_RAW, partial: false });
    const res = await GET(req("http://x/api/stuck-prs?org=acme"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Partial")).toBeNull();
  });

  it("user wins over org when both are present", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: STUCK_RAW, partial: false });
    const res = await GET(req("http://x/api/stuck-prs?org=acme&user=mfozmen"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toContain("user:mfozmen");
    expect(queryMock.mock.calls[0][2].q).not.toContain("org:acme");
  });
});

// A spent hourly budget is not a broken query, and the board can only say so
// if the route stops flattening both into one 502.
describe("when GitHub's hourly budget is spent", () => {
  it("answers 429 and passes the reset time on", async () => {
    readTokenMock.mockResolvedValue("t");
    const err = Object.assign(new Error("Request failed"), {
      errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded for user ID 1" }],
      response: { headers: { "x-ratelimit-reset": "1787828206" } },
    });
    queryMock.mockRejectedValue(err);
    const res = await GET(req("http://localhost/api/stuck-prs?user=me"));
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Reset")).toBe("2026-08-27T10:56:46.000Z");
  });

  it("still answers 502 for anything else", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockRejectedValue(new Error("network down"));
    const res = await GET(req("http://localhost/api/stuck-prs?user=me"));
    expect(res.status).toBe(502);
  });
});

// A refresh's price was invisible until an hour of failures made it urgent.
describe("what it cost", () => {
  it("passes GitHub's own reckoning back to the browser", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({
      data: {
        ...STUCK_RAW,
        rateLimit: { cost: 17, remaining: 4231, resetAt: "2026-08-27T13:00:00.000Z" },
      },
      partial: false,
    });
    const res = await GET(req("http://localhost/api/stuck-prs?user=me"));
    expect(res.headers.get("X-Cost")).toBe("17");
    expect(res.headers.get("X-Budget-Remaining")).toBe("4231");
    expect(res.headers.get("X-Budget-Reset")).toBe("2026-08-27T13:00:00.000Z");
  });

  it("says nothing when GitHub didn't", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: STUCK_RAW, partial: false });
    const res = await GET(req("http://localhost/api/stuck-prs?user=me"));
    expect(res.headers.get("X-Cost")).toBeNull();
  });
});
