import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { readTokenMock } = vi.hoisted(() => ({ readTokenMock: vi.fn() }));
vi.mock("@/lib/session", () => ({ readToken: readTokenMock, readLogin: vi.fn() }));

import { GET, PUT } from "./route";
import { INTERVAL_FILE_ENV } from "@/lib/poll-interval-store";
import { DEFAULT_POLL_INTERVAL_MS } from "@/lib/notify";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "prison-interval-route-"));
  vi.stubEnv(INTERVAL_FILE_ENV, join(dir, "poll-interval"));
  readTokenMock.mockResolvedValue("t");
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const req = (url: string, init?: RequestInit) => new Request(url, init);
const put = (ms: unknown) =>
  PUT(req("http://localhost/api/poll-interval", { method: "PUT", body: JSON.stringify({ ms }) }));

// The menu-bar plugin reads this to decide whether it is due. It has no
// browser, so it cannot be asked to hold a session for a number that is a
// preference rather than anyone's data — but it does run on this machine, and
// that is the thing worth checking.
describe("GET /api/poll-interval", () => {
  it("answers the stored interval to a caller on this machine", async () => {
    await put(5 * 60_000);
    const res = await GET(req("http://localhost:3000/api/poll-interval"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ms: 5 * 60_000 });
  });

  it("answers the default before anything has been stored", async () => {
    const res = await GET(req("http://localhost:3000/api/poll-interval"));
    expect(await res.json()).toEqual({ ms: DEFAULT_POLL_INTERVAL_MS });
  });

  it("refuses a caller that is not local", async () => {
    const res = await GET(req("http://prison.example.com/api/poll-interval"));
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/poll-interval", () => {
  it("stores an interval the picker offers", async () => {
    expect((await put(60 * 60_000)).status).toBe(204);
    expect(await (await GET(req("http://localhost/api/poll-interval"))).json()).toEqual({
      ms: 60 * 60_000,
    });
  });

  it("refuses one it does not", async () => {
    expect((await put(7)).status).toBe(400);
    expect((await put("soon")).status).toBe(400);
  });

  it("refuses a body that is not JSON", async () => {
    const res = await PUT(
      req("http://localhost/api/poll-interval", { method: "PUT", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  // Writing is a signed-in action: it changes what the machine does on its own.
  it("refuses when there is no session", async () => {
    readTokenMock.mockResolvedValue(null);
    expect((await put(5 * 60_000)).status).toBe(401);
  });
});
