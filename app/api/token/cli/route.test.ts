import { describe, it, expect, vi, beforeEach } from "vitest";

const { execFileMock, queryMock, setSessionMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  queryMock: vi.fn(),
  setSessionMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: { execFile: execFileMock },
  execFile: execFileMock,
}));
vi.mock("@/lib/github/client", () => ({ ghClient: () => queryMock }));
vi.mock("@/lib/session", () => ({ setSession: setSessionMock }));
vi.mock("node:util", () => ({
  default: { promisify: () => execFileMock },
  promisify: () => execFileMock,
}));

import { POST } from "./route";

beforeEach(() => {
  execFileMock.mockReset();
  queryMock.mockReset();
  setSessionMock.mockReset();
  process.env.AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaa";
});

describe("POST /api/token/cli", () => {
  it("returns 503 when gh CLI is not available", async () => {
    execFileMock.mockRejectedValue(new Error("spawn gh ENOENT"));
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain("not available or not signed in");
  });

  it("returns 503 when gh CLI exits cleanly but yields an empty token", async () => {
    execFileMock.mockResolvedValue({ stdout: "  \n" });
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain("not available or not signed in");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 401 when viewer has no login", async () => {
    execFileMock.mockResolvedValue({ stdout: "ghp_fake\n" });
    queryMock.mockResolvedValue({ viewer: {} });
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 401 when the GitHub call throws", async () => {
    execFileMock.mockResolvedValue({ stdout: "ghp_fake\n" });
    queryMock.mockRejectedValue(new Error("bad credentials"));
    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain("Invalid token");
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("returns 200 and calls setSession on success", async () => {
    execFileMock.mockResolvedValue({ stdout: "ghp_real\n" });
    queryMock.mockResolvedValue({ viewer: { login: "alice" } });
    setSessionMock.mockResolvedValue(undefined);
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ login: "alice" });
    expect(setSessionMock).toHaveBeenCalledOnce();
    expect(setSessionMock).toHaveBeenCalledWith("ghp_real", "alice");
  });
});
