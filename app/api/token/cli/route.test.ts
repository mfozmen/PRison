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

const local = () => new Request("http://localhost:3000/api/token/cli", { method: "POST" });

describe("POST /api/token/cli", () => {
  it("returns 403 from a non-loopback host", async () => {
    const res = await POST(
      new Request("http://prison.example.com/api/token/cli", { method: "POST" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ reason: "not-local" });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("returns 503 with not-installed when gh CLI is not available (ENOENT)", async () => {
    execFileMock.mockRejectedValue(
      Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" }),
    );
    const res = await POST(local());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ reason: "not-installed" });
  });

  it("returns 503 with not-signed-in when gh exits with a non-ENOENT error", async () => {
    execFileMock.mockRejectedValue(
      Object.assign(new Error("exit 1"), { code: "1" }),
    );
    const res = await POST(local());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ reason: "not-signed-in" });
  });

  it("returns 503 with not-signed-in when gh CLI exits cleanly but yields an empty token", async () => {
    execFileMock.mockResolvedValue({ stdout: "  \n" });
    const res = await POST(local());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ reason: "not-signed-in" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 401 with token-rejected when viewer has no login", async () => {
    execFileMock.mockResolvedValue({ stdout: "ghp_fake\n" });
    queryMock.mockResolvedValue({ viewer: {} });
    const res = await POST(local());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ reason: "token-rejected" });
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("returns 401 with token-rejected when the GitHub call throws", async () => {
    execFileMock.mockResolvedValue({ stdout: "ghp_fake\n" });
    queryMock.mockRejectedValue(new Error("bad credentials"));
    const res = await POST(local());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ reason: "token-rejected" });
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("returns 200 and calls setSession on success", async () => {
    execFileMock.mockResolvedValue({ stdout: "ghp_real\n" });
    queryMock.mockResolvedValue({ viewer: { login: "alice" } });
    setSessionMock.mockResolvedValue(undefined);
    const res = await POST(local());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ login: "alice" });
    expect(setSessionMock).toHaveBeenCalledOnce();
    expect(setSessionMock).toHaveBeenCalledWith("ghp_real", "alice");
  });
});
