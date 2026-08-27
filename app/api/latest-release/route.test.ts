import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { readTokenMock } = vi.hoisted(() => ({ readTokenMock: vi.fn() }));

vi.mock("@/lib/session", () => ({
  readToken: readTokenMock,
  readLogin: vi.fn(),
}));

import { GET } from "./route";
import { PROJECT_OWNER, PROJECT_NAME } from "@/lib/project";
import { RELEASE_FILE_ENV, releaseFilePath } from "@/lib/release-store";

let dir: string;
const fetchMock = vi.fn();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "prison-release-route-"));
  process.env[RELEASE_FILE_ENV] = join(dir, "latest-release.json");
  readTokenMock.mockReset();
  readTokenMock.mockResolvedValue("t");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env[RELEASE_FILE_ENV];
  rmSync(dir, { recursive: true, force: true });
});

const released = (tag: string) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ tag_name: tag }),
});

describe("GET /api/latest-release", () => {
  it("returns 401 when there is no token", async () => {
    readTokenMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the latest release tag", async () => {
    fetchMock.mockResolvedValue(released("v1.24.0"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tagName: "v1.24.0" });
  });

  it("asks about PRison itself, not whatever repo the user is looking at", async () => {
    fetchMock.mockResolvedValue(released("v1.24.0"));
    await GET();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.github.com/repos/${PROJECT_OWNER}/${PROJECT_NAME}/releases/latest`,
    );
  });

  it("asks without a token, so the account's own allowance pays nothing", async () => {
    // The point of the whole route: the hourly GraphQL budget belongs to the
    // user's work, and a version check is not their work.
    fetchMock.mockResolvedValue(released("v1.24.0"));
    await GET();
    const headers = (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("authorization");
  });

  it("reports no release as null rather than omitting the field", async () => {
    // The client distinguishes "no release" from "couldn't ask"; an absent
    // field would collapse the two.
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tagName: null });
  });

  it("asks GitHub once a day, not once a tab", async () => {
    fetchMock.mockResolvedValue(released("v1.24.0"));
    await GET();
    await GET();
    await GET();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the answer where a restarted container will find it", async () => {
    fetchMock.mockResolvedValue(released("v1.24.0"));
    await GET();
    expect(JSON.parse(readFileSync(releaseFilePath(), "utf8")).tagName).toBe("v1.24.0");
  });

  it("serves an answer this process never fetched", async () => {
    writeFileSync(
      releaseFilePath(),
      JSON.stringify({ tagName: "v9.9.9", fetchedAt: Date.now() }),
    );
    const res = await GET();
    expect(await res.json()).toEqual({ tagName: "v9.9.9" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when GitHub cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("network error"));
    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("returns 502 when GitHub answers with something else entirely", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect((await GET()).status).toBe(502);
  });

  it("returns 502 rather than a tag that is not one", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    expect((await GET()).status).toBe(502);
  });

  it("does not remember a failure as an answer", async () => {
    // A day of silence because GitHub had a bad minute is the failure mode
    // this cache could easily introduce.
    fetchMock.mockRejectedValueOnce(new Error("network error"));
    await GET();
    fetchMock.mockResolvedValue(released("v1.24.0"));
    expect(await (await GET()).json()).toEqual({ tagName: "v1.24.0" });
  });
});
