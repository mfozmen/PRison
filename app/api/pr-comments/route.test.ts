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

const COMMENTS_RAW = {
  search: {
    nodes: [
      {
        id: "PR_1",
        number: 2,
        url: "https://gh/acme/b/pull/2",
        repository: { nameWithOwner: "acme/b" },
        reviewThreads: {
          nodes: [
            {
              id: "t1",
              isResolved: false,
              path: "src/app.ts",
              comments: {
                nodes: [
                  {
                    author: { login: "alice", __typename: "User" },
                    bodyText: "please fix",
                    createdAt: "2026-07-01T00:00:00Z",
                    url: "https://gh/acme/b/pull/2#discussion_r1",
                  },
                ],
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
  readLoginMock.mockReset();
  queryMock.mockReset();
});

describe("GET /api/pr-comments", () => {
  it("returns 401 when there is no token", async () => {
    readTokenMock.mockResolvedValue(null);
    const res = await GET(req("http://x/api/pr-comments"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the viewer login is missing", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue(null);
    const res = await GET(req("http://x/api/pr-comments"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org contains invalid characters", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    const res = await GET(req("http://x/api/pr-comments?org=acme+repo%3Ax%2Fy"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when user contains invalid characters", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    const res = await GET(req("http://x/api/pr-comments?user=invalid+char"));
    expect(res.status).toBe(400);
  });

  it("returns parsed comments scoped to an org", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockResolvedValue({ data: COMMENTS_RAW, partial: false });
    const res = await GET(req("http://x/api/pr-comments?org=acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].url).toBe("https://gh/acme/b/pull/2#discussion_r1");
    expect(body[0].author).toBe("alice");
    expect(queryMock.mock.calls[0][2].q).toBe("is:open is:pr author:@me org:acme");
  });

  it("drops comments the viewer already replied to (login threaded into the parser)", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("alice");
    queryMock.mockResolvedValue({ data: COMMENTS_RAW, partial: false });
    const res = await GET(req("http://x/api/pr-comments"));
    expect(await res.json()).toEqual([]);
  });

  it("spans everything (no org scope) when org is omitted", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockResolvedValue({ data: COMMENTS_RAW, partial: false });
    const res = await GET(req("http://x/api/pr-comments"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toBe("is:open is:pr author:@me");
  });

  it("returns parsed comments scoped to a personal account (?user=mfozmen)", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockResolvedValue({ data: COMMENTS_RAW, partial: false });
    const res = await GET(req("http://x/api/pr-comments?user=mfozmen"));
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][2].q).toBe("is:open is:pr author:@me user:mfozmen");
  });

  it("user wins over org when both are present", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockResolvedValue({ data: COMMENTS_RAW, partial: false });
    await GET(req("http://x/api/pr-comments?org=acme&user=mfozmen"));
    expect(queryMock.mock.calls[0][2].q).toContain("user:mfozmen");
    expect(queryMock.mock.calls[0][2].q).not.toContain("org:acme");
  });

  it("returns 502 when GitHub API throws", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockRejectedValue(new Error("network error"));
    const res = await GET(req("http://x/api/pr-comments?org=acme"));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream GitHub error");
  });

  it("sets X-Partial header when ghQuery reports partial data", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockResolvedValue({ data: COMMENTS_RAW, partial: true });
    const res = await GET(req("http://x/api/pr-comments?org=acme"));
    expect(res.headers.get("X-Partial")).toBe("1");
  });

  it("omits X-Partial header when data is complete", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockResolvedValue({ data: COMMENTS_RAW, partial: false });
    const res = await GET(req("http://x/api/pr-comments?org=acme"));
    expect(res.headers.get("X-Partial")).toBeNull();
  });
});
