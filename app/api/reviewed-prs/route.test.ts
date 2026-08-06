import { describe, it, expect, vi, beforeEach } from "vitest";

const { readTokenMock, readLoginMock, queryMock } = vi.hoisted(() => ({
  readTokenMock: vi.fn(),
  readLoginMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  readToken: readTokenMock,
  readLogin: readLoginMock,
}));
vi.mock("@/lib/github/client", () => ({ ghQuery: queryMock }));

import { GET } from "./route";

function req(url: string) {
  return new Request(url);
}

const REVIEWED_RAW = {
  search: {
    nodes: [
      {
        id: "PR_9",
        title: "add retry backoff",
        url: "https://gh/acme/e/pull/9",
        number: 9,
        isDraft: false,
        repository: { nameWithOwner: "acme/e" },
        author: { login: "alice" },
        reviews: { nodes: [{ state: "CHANGES_REQUESTED", submittedAt: "2026-07-01T00:00:00Z" }] },
        commits: { nodes: [{ commit: { pushedDate: "2026-07-02T00:00:00Z" } }] },
      },
    ],
  },
};

beforeEach(() => {
  readTokenMock.mockReset();
  readLoginMock.mockReset();
  queryMock.mockReset();
});

describe("GET /api/reviewed-prs", () => {
  it("returns 401 when there is no token", async () => {
    readTokenMock.mockResolvedValue(null);
    const res = await GET(req("http://x/api/reviewed-prs"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the session has no login", async () => {
    // reviews(author:) needs a literal login — @me is a search qualifier only.
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue(null);
    const res = await GET(req("http://x/api/reviewed-prs"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org contains invalid characters", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("octocat");
    const res = await GET(req("http://x/api/reviewed-prs?org=acme+repo%3Ax%2Fy"));
    expect(res.status).toBe(400);
  });

  it("returns parsed reviewed PRs scoped to an org, with the viewer as the review author", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("octocat");
    queryMock.mockResolvedValue({ data: REVIEWED_RAW, partial: false });
    const res = await GET(req("http://x/api/reviewed-prs?org=acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].state).toBe("CHANGES_REQUESTED");
    expect(body[0].updatedSince).toBe(true);
    expect(queryMock.mock.calls[0][2]).toEqual({
      q: "is:open is:pr reviewed-by:@me org:acme",
      login: "octocat",
    });
  });

  it("spans everything (no org scope) when org is omitted", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("octocat");
    queryMock.mockResolvedValue({ data: REVIEWED_RAW, partial: false });
    const res = await GET(req("http://x/api/reviewed-prs"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toBe("is:open is:pr reviewed-by:@me");
  });

  it("scopes to a personal account (?user=octocat)", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("octocat");
    queryMock.mockResolvedValue({ data: REVIEWED_RAW, partial: false });
    const res = await GET(req("http://x/api/reviewed-prs?user=octocat"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toBe("is:open is:pr reviewed-by:@me user:octocat");
  });

  it("returns 400 when user contains invalid characters", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("octocat");
    const res = await GET(req("http://x/api/reviewed-prs?user=invalid+char"));
    expect(res.status).toBe(400);
  });

  it("returns 502 when GitHub API throws", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("octocat");
    queryMock.mockRejectedValue(new Error("network error"));
    const res = await GET(req("http://x/api/reviewed-prs?org=acme"));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream GitHub error");
  });

  it("sets X-Partial header when ghQuery reports partial data", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("octocat");
    queryMock.mockResolvedValue({ data: REVIEWED_RAW, partial: true });
    const res = await GET(req("http://x/api/reviewed-prs?org=acme"));
    expect(res.headers.get("X-Partial")).toBe("1");
  });

  it("omits X-Partial header when data is complete", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("octocat");
    queryMock.mockResolvedValue({ data: REVIEWED_RAW, partial: false });
    const res = await GET(req("http://x/api/reviewed-prs?org=acme"));
    expect(res.headers.get("X-Partial")).toBeNull();
  });
});
