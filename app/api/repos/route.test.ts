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

describe("GET /api/repos", () => {
  it("returns 401 when there is no token", async () => {
    readTokenMock.mockResolvedValue(null);
    const req = new Request("http://localhost/api/repos?q=acme");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns empty array when q is too short (1 char)", async () => {
    readTokenMock.mockResolvedValue("token");
    const req = new Request("http://localhost/api/repos?q=a");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns empty array when q is missing", async () => {
    readTokenMock.mockResolvedValue("token");
    const req = new Request("http://localhost/api/repos");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns empty array when q is only control characters (sanitizes to < 2 chars)", async () => {
    readTokenMock.mockResolvedValue("token");
    const req = new Request("http://localhost/api/repos?q=%00%01");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
    // The degenerate " in:name fork:true" search must never reach GitHub.
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns parsed repo names for valid q", async () => {
    readTokenMock.mockResolvedValue("token");
    queryMock.mockResolvedValue({
      search: {
        nodes: [
          { nameWithOwner: "acme/web" },
          { nameWithOwner: "beta/api" },
        ],
      },
    });
    const req = new Request("http://localhost/api/repos?q=acme");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(["acme/web", "beta/api"]);
    // q is passed as a GraphQL variable, with the search qualifiers appended
    const vars = queryMock.mock.calls[0][2];
    expect(vars).toEqual({ q: "acme in:name fork:true" });
  });

  it("strips control characters and caps q at 100 chars before searching", async () => {
    readTokenMock.mockResolvedValue("token");
    queryMock.mockResolvedValue({ search: { nodes: [] } });
    const dirty = "ac\x00me\x1Frepo\x7F" + "x".repeat(200);
    const req = new Request(
      `http://localhost/api/repos?q=${encodeURIComponent(dirty)}`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const vars = queryMock.mock.calls[0][2] as { q: string };
    // control chars removed, sanitized portion capped at 100 chars
    const sanitized = ("acmerepo" + "x".repeat(200)).slice(0, 100);
    expect(vars.q).toBe(`${sanitized} in:name fork:true`);
    expect(vars.q).not.toMatch(/[\x00-\x1F\x7F]/);
  });

  it("returns 502 when ghQuery throws", async () => {
    readTokenMock.mockResolvedValue("token");
    queryMock.mockRejectedValue(new Error("network error"));
    const req = new Request("http://localhost/api/repos?q=acme");
    const res = await GET(req);
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream GitHub error");
  });
});
