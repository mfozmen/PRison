import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { isLoopbackMock, queryMock, setSessionMock } = vi.hoisted(() => ({
  isLoopbackMock: vi.fn(),
  queryMock: vi.fn(),
  setSessionMock: vi.fn(),
}));

vi.mock("@/lib/loopback", () => ({ isLoopback: isLoopbackMock }));
vi.mock("@/lib/github/client", () => ({ ghClient: () => queryMock }));
vi.mock("@/lib/session", () => ({ setSession: setSessionMock }));

import { POST } from "./route";

beforeEach(() => {
  isLoopbackMock.mockReset();
  queryMock.mockReset();
  setSessionMock.mockReset();
  isLoopbackMock.mockReturnValue(true);
  process.env.AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaa";
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
});

afterEach(() => {
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
});

const req = () => new Request("http://localhost:3000/api/token/env", { method: "POST" });

describe("POST /api/token/env", () => {
  it("returns 403 from a non-loopback request", async () => {
    isLoopbackMock.mockReturnValue(false);
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ reason: "not-local" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 404 when GITHUB_TOKEN and GH_TOKEN are both unset", async () => {
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ reason: "no-env-token" });
  });

  it("falls back to GH_TOKEN when GITHUB_TOKEN is unset", async () => {
    process.env.GH_TOKEN = "ghp_gh";
    queryMock.mockResolvedValue({ viewer: { login: "bob" } });
    setSessionMock.mockResolvedValue(undefined);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ login: "bob" });
    expect(setSessionMock).toHaveBeenCalledWith("ghp_gh", "bob");
  });

  it("returns 401 with token-rejected when viewer login is falsy", async () => {
    process.env.GITHUB_TOKEN = "ghp_fake";
    queryMock.mockResolvedValue({ viewer: {} });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ reason: "token-rejected" });
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("returns 401 with token-rejected when GitHub throws", async () => {
    process.env.GITHUB_TOKEN = "ghp_fake";
    queryMock.mockRejectedValue(new Error("bad credentials"));
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ reason: "token-rejected" });
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("returns 200 and calls setSession with token and login on success", async () => {
    process.env.GITHUB_TOKEN = "ghp_real";
    queryMock.mockResolvedValue({ viewer: { login: "alice" } });
    setSessionMock.mockResolvedValue(undefined);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ login: "alice" });
    expect(setSessionMock).toHaveBeenCalledOnce();
    expect(setSessionMock).toHaveBeenCalledWith("ghp_real", "alice");
  });
});
