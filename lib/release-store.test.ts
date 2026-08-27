import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RELEASE_FILE_ENV,
  DEFAULT_RELEASE_FILE,
  RELEASE_MAX_AGE_MS,
  releaseFilePath,
  readCachedRelease,
  writeCachedRelease,
} from "./release-store";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "prison-release-"));
  process.env[RELEASE_FILE_ENV] = join(dir, "latest-release.json");
});

afterEach(() => {
  delete process.env[RELEASE_FILE_ENV];
  rmSync(dir, { recursive: true, force: true });
});

describe("releaseFilePath", () => {
  it("falls back to the container's volume when nothing says otherwise", () => {
    delete process.env[RELEASE_FILE_ENV];
    expect(releaseFilePath()).toBe(DEFAULT_RELEASE_FILE);
  });

  it("goes where the environment points it", () => {
    expect(releaseFilePath()).toBe(join(dir, "latest-release.json"));
  });
});

describe("readCachedRelease", () => {
  it("has no answer before anything has been written", () => {
    expect(readCachedRelease(1000)).toBeNull();
  });

  it("answers from the file an earlier process left behind", () => {
    // Written to disk rather than through writeCachedRelease, because the
    // point is the restarted container: a process with nothing in memory.
    writeFileSync(
      releaseFilePath(),
      JSON.stringify({ tagName: "v1.24.0", fetchedAt: 1000 }),
    );
    expect(readCachedRelease(1000 + RELEASE_MAX_AGE_MS - 1)).toEqual({
      tagName: "v1.24.0",
      fetchedAt: 1000,
    });
  });

  it("answers from memory when the disk has nothing", () => {
    writeCachedRelease({ tagName: "v1.24.0", fetchedAt: 1000 });
    expect(readCachedRelease(1000 + RELEASE_MAX_AGE_MS - 1)?.tagName).toBe(
      "v1.24.0",
    );
  });

  it("forgets an answer older than a day", () => {
    writeFileSync(
      releaseFilePath(),
      JSON.stringify({ tagName: "v1.24.0", fetchedAt: 1000 }),
    );
    expect(readCachedRelease(1000 + RELEASE_MAX_AGE_MS)).toBeNull();
  });

  it("forgets a remembered answer older than a day too", () => {
    writeCachedRelease({ tagName: "v1.24.0", fetchedAt: 1000 });
    expect(readCachedRelease(1000 + RELEASE_MAX_AGE_MS)).toBeNull();
  });

  it("remembers that there was no release at all, rather than asking again", () => {
    // "This repository has never published one" is an answer, and a cache that
    // treats it as a miss goes back to GitHub every time.
    writeCachedRelease({ tagName: null, fetchedAt: 1000 });
    expect(readCachedRelease(2000)).toEqual({ tagName: null, fetchedAt: 1000 });
  });

  it("ignores a file it cannot make sense of", () => {
    writeFileSync(releaseFilePath(), "not json");
    expect(readCachedRelease(1000)).toBeNull();
  });

  it("ignores a file whose shape is wrong", () => {
    writeFileSync(
      releaseFilePath(),
      JSON.stringify({ tagName: 7, fetchedAt: 1000 }),
    );
    expect(readCachedRelease(1000)).toBeNull();
  });

  it("ignores a time it cannot use", () => {
    writeFileSync(releaseFilePath(), JSON.stringify({ tagName: "v1.0.0" }));
    expect(readCachedRelease(1000)).toBeNull();
  });

  it("ignores valid JSON that is not an object at all", () => {
    writeFileSync(releaseFilePath(), "7");
    expect(readCachedRelease(1000)).toBeNull();
  });
});

describe("writeCachedRelease", () => {
  it("puts the answer where the next process will find it", () => {
    writeCachedRelease({ tagName: "v2.0.0", fetchedAt: 5 });
    expect(JSON.parse(readFileSync(releaseFilePath(), "utf8"))).toEqual({
      tagName: "v2.0.0",
      fetchedAt: 5,
    });
  });

  it("still remembers when the disk will not have it", () => {
    // A read-only mount, or a development server with no /data at all: the
    // point of the cache is to not ask GitHub again, and this process can
    // manage that much on its own.
    // A path that cannot be created: the parent is a file, not a directory.
    writeFileSync(join(dir, "wall"), "");
    process.env[RELEASE_FILE_ENV] = join(dir, "wall", "x.json");
    writeCachedRelease({ tagName: "v3.0.0", fetchedAt: 5 });
    expect(readCachedRelease(6)).toEqual({ tagName: "v3.0.0", fetchedAt: 5 });
  });
});
