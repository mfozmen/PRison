import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readStoredInterval,
  writeStoredInterval,
  intervalFilePath,
  INTERVAL_FILE_ENV,
  DEFAULT_INTERVAL_FILE,
} from "./poll-interval-store";
import { DEFAULT_POLL_INTERVAL_MS } from "./notify";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "prison-interval-"));
  vi.stubEnv(INTERVAL_FILE_ENV, join(dir, "poll-interval"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

// The plugin outside the browser and the dashboard inside it have to agree on
// one number. localStorage cannot be read from a shell, so the answer lives
// here — written by whoever changes it, read by whoever needs it.
describe("the poll interval, as the server knows it", () => {
  it("lives on the container's volume unless told otherwise", () => {
    expect(intervalFilePath()).toBe(join(dir, "poll-interval"));
    vi.unstubAllEnvs();
    delete process.env[INTERVAL_FILE_ENV];
    expect(intervalFilePath()).toBe(DEFAULT_INTERVAL_FILE);
  });

  it("hands back what was written", () => {
    writeStoredInterval(5 * 60_000);
    expect(readStoredInterval()).toBe(5 * 60_000);
  });

  it("survives a restart, because it is on disk", () => {
    // What a previous process left behind: this one has never written it, so
    // the answer can only have come off the disk.
    const file = join(dir, "from-a-previous-life");
    vi.stubEnv(INTERVAL_FILE_ENV, file);
    writeFileSync(file, String(60 * 60_000));
    expect(readStoredInterval()).toBe(60 * 60_000);
  });

  it("defaults when nothing has ever been written", () => {
    vi.stubEnv(INTERVAL_FILE_ENV, join(dir, "never-written"));
    expect(readStoredInterval()).toBe(DEFAULT_POLL_INTERVAL_MS);
  });

  it("refuses an interval that is not one of the offered options", () => {
    writeStoredInterval(15 * 60_000);
    writeStoredInterval(7);
    expect(readStoredInterval()).toBe(15 * 60_000);
  });

  it("defaults when the file holds something that is not a number", () => {
    const file = join(dir, "junk");
    vi.stubEnv(INTERVAL_FILE_ENV, file);
    writeFileSync(file, "every so often");
    expect(readStoredInterval()).toBe(DEFAULT_POLL_INTERVAL_MS);
  });

  // A read-only /data is a deployment choice, not a reason to fail a request.
  it("keeps working in memory when the file cannot be written", () => {
    // A directory is not a file you can write a number into — the same shape
    // of failure as a read-only /data, which is a deployment choice rather
    // than a reason for the setting to stop working.
    vi.stubEnv(INTERVAL_FILE_ENV, dir);
    expect(writeStoredInterval(5 * 60_000)).toBe(true);
    expect(readStoredInterval()).toBe(5 * 60_000);
  });

  it("writes the file where the environment points", () => {
    const file = join(dir, "poll-interval");
    writeStoredInterval(60 * 60_000);
    expect(readFileSync(file, "utf8")).toBe("3600000");
  });
});
