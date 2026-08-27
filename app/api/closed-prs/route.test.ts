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

const CLOSED_RAW = {
  search: {
    nodes: [
      {
        id: "1",
        title: "merged pr",
        url: "https://github.com/acme/b/pull/1",
        number: 1,
        merged: true,
        mergedAt: "2026-06-25T00:00:00Z",
        closedAt: "2026-06-25T00:00:01Z",
        repository: { nameWithOwner: "acme/b" },
      },
    ],
  },
};

beforeEach(() => {
  readTokenMock.mockReset();
  queryMock.mockReset();
});

describe("GET /api/closed-prs", () => {
  it("returns 401 when there is no token", async () => {
    readTokenMock.mockResolvedValue(null);
    const res = await GET(req("http://x/api/closed-prs"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org contains invalid characters", async () => {
    readTokenMock.mockResolvedValue("t");
    const res = await GET(req("http://x/api/closed-prs?org=acme+repo%3Ax%2Fy"));
    expect(res.status).toBe(400);
  });

  it("returns parsed closed PRs scoped to an org", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: CLOSED_RAW, partial: false });
    const res = await GET(req("http://x/api/closed-prs?org=acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].merged).toBe(true);
    expect(body[0].endedAt).toBe("2026-06-25T00:00:00Z");
    expect(queryMock.mock.calls[0][2].q).toBe(
      "is:closed is:pr author:@me org:acme sort:updated-desc",
    );
  });

  it("spans everything (no org scope) when org is omitted", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: CLOSED_RAW, partial: false });
    const res = await GET(req("http://x/api/closed-prs"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toBe(
      "is:closed is:pr author:@me sort:updated-desc",
    );
  });

  it("returns 502 when GitHub API throws", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockRejectedValue(new Error("network error"));
    const res = await GET(req("http://x/api/closed-prs?org=acme"));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream GitHub error");
  });

  it("returns closed PRs scoped to a personal account (?user=mfozmen)", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: CLOSED_RAW, partial: false });
    const res = await GET(req("http://x/api/closed-prs?user=mfozmen"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toBe(
      "is:closed is:pr author:@me user:mfozmen sort:updated-desc",
    );
  });

  it("returns 400 when user contains invalid characters", async () => {
    readTokenMock.mockResolvedValue("t");
    const res = await GET(req("http://x/api/closed-prs?user=invalid+char"));
    expect(res.status).toBe(400);
  });

  it("sets X-Partial header when ghQuery reports partial data", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: CLOSED_RAW, partial: true });
    const res = await GET(req("http://x/api/closed-prs?org=acme"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Partial")).toBe("1");
  });

  it("omits X-Partial header when data is complete", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: CLOSED_RAW, partial: false });
    const res = await GET(req("http://x/api/closed-prs?org=acme"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Partial")).toBeNull();
  });
});

// A spent hourly budget reaches every route, and the board can only name it
// if every route says so rather than flattening it into a bare 502.
describe("when GitHub's hourly budget is spent", () => {
  it("answers 429 with the reset time", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockRejectedValue(
      Object.assign(new Error("Request failed"), {
        errors: [{ type: "RATE_LIMITED" }],
        headers: { "x-ratelimit-reset": "1787828206" },
      }),
    );
    const res = await GET(new Request("http://localhost/api/closed-prs?user=me"));
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Reset")).toBe("2026-08-27T10:56:46.000Z");
  });
});

// The price rides on every list, so every list has to be asked whether it
// carries it — the wiring is per route, and a dropped one is invisible.
describe("what it cost", () => {
  it("passes GitHub's own reckoning back to the browser", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({
      data: {
        search: { nodes: [] },
        rateLimit: { cost: 9, remaining: 4100, resetAt: "2026-08-27T13:00:00.000Z" },
      },
      partial: false,
    });
    const res = await GET(new Request("http://localhost/api/closed-prs?user=me"));
    expect(res.headers.get("X-Cost")).toBe("9");
    expect(res.headers.get("X-Budget-Remaining")).toBe("4100");
  });
});
