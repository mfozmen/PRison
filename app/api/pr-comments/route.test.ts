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

// Marks every thread as opened by the viewer, which is what the reviewed-PR
// search keeps.
function startedByViewer(raw: typeof COMMENTS_RAW) {
  return {
    search: {
      nodes: raw.search.nodes.map((pr) => ({
        ...pr,
        reviewThreads: {
          nodes: pr.reviewThreads.nodes.map((t) => ({
            ...t,
            starter: { nodes: [{ author: { login: "mfozmen" } }] },
          })),
        },
      })),
    },
  };
}

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
  it("runs both searches: own PRs and PRs the viewer reviewed", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockResolvedValue({ data: { search: { nodes: [] } }, partial: false });
    await GET(req("http://x/api/pr-comments?org=acme"));
    expect(queryMock.mock.calls.map((c) => c[2].q)).toEqual([
      "is:open is:pr author:@me org:acme",
      "is:open is:pr reviewed-by:@me -author:@me org:acme sort:updated-desc",
    ]);
  });

  it("asks for the thread starter only on the leg that reads it", async () => {
    // It is the heaviest query in the app and it runs twice per refresh; the
    // own-PR leg never looks at who opened a thread.
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockResolvedValue({ data: { search: { nodes: [] } }, partial: false });
    await GET(req("http://x/api/pr-comments"));
    expect(queryMock.mock.calls.map((c) => c[2].withStarter)).toEqual([false, true]);
  });

  it("asks for review bodies only on the own-PR leg", async () => {
    // A review body on someone else's PR is either the viewer's own or another
    // reviewer's — neither is the viewer's to answer, so the reviewed leg does
    // not pay for the two extra connections.
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockResolvedValue({ data: { search: { nodes: [] } }, partial: false });
    await GET(req("http://x/api/pr-comments"));
    expect(queryMock.mock.calls.map((c) => c[2].withReviews)).toEqual([true, false]);
  });

  it("keeps only viewer-raised threads from the reviewed-PR search", async () => {
    // On someone else's PR every unresolved thread is waiting on somebody;
    // only the ones the viewer raised are waiting on the viewer.
    const reviewedRaw = (starter: string) => ({
      search: {
        nodes: [
          {
            id: "PR_9",
            number: 9,
            url: "https://gh/acme/e/pull/9",
            repository: { nameWithOwner: "acme/e" },
            reviewThreads: {
              nodes: [
                {
                  id: "t9",
                  isResolved: false,
                  path: "internal/dispatch.go",
                  starter: { nodes: [{ author: { login: starter } }] },
                  comments: {
                    nodes: [
                      {
                        author: { login: "alice", __typename: "User" },
                        bodyText: "done",
                        createdAt: "2026-07-02T00:00:00Z",
                        url: "https://gh/acme/e/pull/9#discussion_r9",
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    });
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock
      .mockResolvedValueOnce({ data: { search: { nodes: [] } }, partial: false })
      .mockResolvedValueOnce({ data: reviewedRaw("mfozmen"), partial: false });
    const mine = await (await GET(req("http://x/api/pr-comments"))).json();
    expect(mine.map((c: { id: string }) => c.id)).toEqual(["t9"]);

    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce({ data: { search: { nodes: [] } }, partial: false })
      .mockResolvedValueOnce({ data: reviewedRaw("bob"), partial: false });
    const theirs = await (await GET(req("http://x/api/pr-comments"))).json();
    expect(theirs).toEqual([]);
  });

  it("sets X-Partial when only the reviewed-PR search was partial", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock
      .mockResolvedValueOnce({ data: { search: { nodes: [] } }, partial: false })
      .mockResolvedValueOnce({ data: { search: { nodes: [] } }, partial: true });
    const res = await GET(req("http://x/api/pr-comments"));
    expect(res.headers.get("X-Partial")).toBe("1");
    // GitHub degrading the data it did return can be the steady state for an
    // account; the list is complete for what the token can see, so the client
    // must keep taking it.
    expect(res.headers.get("X-Incomplete")).toBeNull();
  });

  it("still serves your own PRs' threads when the reviewed search fails", async () => {
    // Before the reviewed search existed this list depended on one query; a
    // blip on the new one must not take the old one down with it.
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock
      .mockResolvedValueOnce({ data: COMMENTS_RAW, partial: false })
      .mockRejectedValueOnce(new Error("network error"));
    const res = await GET(req("http://x/api/pr-comments"));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
    // A leg that never answered is missing data — which is what X-Partial says.
    expect(res.headers.get("X-Partial")).toBe("1");
    // And X-Incomplete says the stronger thing: this list is a truncated view
    // of one that exists, so a silent poll must not overwrite the screen with
    // it.
    expect(res.headers.get("X-Incomplete")).toBe("1");
  });

  it("still serves the reviewed threads when the own-PR search fails", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock
      .mockRejectedValueOnce(new Error("network error"))
      // The reviewed leg keeps only threads the viewer raised, so this one is
      // theirs.
      .mockResolvedValueOnce({ data: startedByViewer(COMMENTS_RAW), partial: false });
    const res = await GET(req("http://x/api/pr-comments"));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
    expect(res.headers.get("X-Partial")).toBe("1");
    expect(res.headers.get("X-Incomplete")).toBe("1");
  });

  it("returns a thread once when both searches somehow surface it", async () => {
    // The thread id is the natural key; a duplicated row would render twice
    // and double-count.
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockResolvedValue({ data: COMMENTS_RAW, partial: false });
    const body = await (await GET(req("http://x/api/pr-comments"))).json();
    expect(body.filter((c: { id: string }) => c.id === "t1")).toHaveLength(1);
  });
});

// This route answers for two searches, so it needed its own wiring — and
// without it a spent budget hitting the heaviest query in the app was the one
// failure the board could not explain.
describe("when GitHub's hourly budget is spent", () => {
  it("answers 429 with the reset time when both searches hit the wall", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("me");
    const spent = Object.assign(new Error("Request failed"), {
      errors: [{ type: "RATE_LIMITED" }],
      headers: { "x-ratelimit-reset": "1787828206" },
    });
    queryMock.mockRejectedValue(spent);
    const res = await GET(new Request("http://localhost/api/pr-comments?user=me"));
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Reset")).toBe("2026-08-27T10:56:46.000Z");
  });

  it("still answers 502 when both searches simply failed", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("me");
    queryMock.mockRejectedValue(new Error("network down"));
    const res = await GET(new Request("http://localhost/api/pr-comments?user=me"));
    expect(res.status).toBe(502);
  });
});

describe("what it cost", () => {
  const priced = (nodes: unknown[]) => ({
    data: {
      search: { nodes },
      rateLimit: { cost: 33, remaining: 3900, resetAt: "2026-08-27T13:00:00.000Z" },
    },
    partial: false,
  });

  it("reports the price of the leg that answered, even when the other did not", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("me");
    // The viewer's own search fails, the reviewed one comes back: the price on
    // the response has to come from the leg that actually reached GitHub.
    queryMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(priced([]));
    const res = await GET(new Request("http://localhost/api/pr-comments?user=me"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cost")).toBe("33");
    expect(res.headers.get("X-Incomplete")).toBe("1");
  });
});
