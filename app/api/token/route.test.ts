import { describe, it, expect, vi, beforeEach } from "vitest";

const { queryMock, cookieStore } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  cookieStore: { set: vi.fn(), delete: vi.fn() },
}));

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));
vi.mock("@/lib/github/client", () => ({ ghClient: () => queryMock }));

import { POST, DELETE } from "./route";

function postReq(body: string) {
  return new Request("http://x/api/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

beforeEach(() => {
  queryMock.mockReset();
  cookieStore.set.mockReset();
  cookieStore.delete.mockReset();
  process.env.AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaa";
});

describe("POST /api/token", () => {
  it("returns 400 for a non-JSON body", async () => {
    const res = await POST(postReq("{not json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no token is provided", async () => {
    const res = await POST(postReq(JSON.stringify({})));
    expect(res.status).toBe(400);
  });

  it("returns 401 when the token resolves no viewer", async () => {
    queryMock.mockResolvedValue({ viewer: {} });
    const res = await POST(postReq(JSON.stringify({ token: "ghp_x" })));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the GitHub call throws", async () => {
    queryMock.mockRejectedValue(new Error("bad credentials"));
    const res = await POST(postReq(JSON.stringify({ token: "ghp_x" })));
    expect(res.status).toBe(401);
  });

  it("validates the token, sets the cookies, and returns the login", async () => {
    queryMock.mockResolvedValue({ viewer: { login: "mfozmen" } });
    const res = await POST(postReq(JSON.stringify({ token: "ghp_real" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ login: "mfozmen" });
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
    // The token cookie value must not be the raw token.
    const tokenCookieValue = cookieStore.set.mock.calls[0][1];
    expect(tokenCookieValue).not.toContain("ghp_real");
  });
});

describe("DELETE /api/token", () => {
  it("clears the cookies", async () => {
    const res = await DELETE();
    expect(res.status).toBe(204);
    expect(cookieStore.delete).toHaveBeenCalledTimes(2);
  });
});
