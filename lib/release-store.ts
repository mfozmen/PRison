import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Where the answer is kept, overridable so tests never touch a real /data and
 * a host that mounts its volume elsewhere can say so. */
export const RELEASE_FILE_ENV = "PRISON_LATEST_RELEASE_FILE";

/** The container's persistent volume — the one directory that survives a
 * `docker run` with a new image, which is exactly when this changes. */
export const DEFAULT_RELEASE_FILE = "/data/latest-release.json";

/** PRison ships every few days; asking once a day is already generous. The
 * cache is what keeps six open tabs and a restarted container from turning
 * one question into a hundred. */
export const RELEASE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** `tagName` is null when the repository has published no release at all —
 * an answer worth caching, not a miss. */
export type CachedRelease = { tagName: string | null; fetchedAt: number };

export function releaseFilePath(): string {
  return process.env[RELEASE_FILE_ENV] ?? DEFAULT_RELEASE_FILE;
}

/** In memory as well as on disk, because /data is a Docker volume a
 * development server does not have and a hardened deployment may mount
 * read-only. Keyed by path, so pointing the environment somewhere else reads
 * that file rather than answering from a memory of the last one. */
let cached: { file: string; entry: CachedRelease } | null = null;

function parse(raw: unknown): CachedRelease | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { tagName, fetchedAt } = raw as Partial<CachedRelease>;
  if (typeof fetchedAt !== "number") return null;
  if (tagName !== null && typeof tagName !== "string") return null;
  return { tagName, fetchedAt };
}

/** The last answer, if it is still worth trusting. `now` is passed in rather
 * than read, so a test can age the cache without waiting a day. */
export function readCachedRelease(now: number): CachedRelease | null {
  const fresh = (entry: CachedRelease) =>
    now - entry.fetchedAt < RELEASE_MAX_AGE_MS ? entry : null;
  if (cached?.file === releaseFilePath()) return fresh(cached.entry);
  try {
    const entry = parse(JSON.parse(readFileSync(releaseFilePath(), "utf8")));
    return entry ? fresh(entry) : null;
  } catch {
    // Never written, unreadable, or not the shape it should be. Either way
    // there is nothing to go on, and asking GitHub once is cheap.
    return null;
  }
}

export function writeCachedRelease(entry: CachedRelease): void {
  cached = { file: releaseFilePath(), entry };
  try {
    mkdirSync(dirname(releaseFilePath()), { recursive: true });
    writeFileSync(releaseFilePath(), JSON.stringify(entry));
  } catch {
    // In memory is enough for as long as this process lives; a host that
    // cannot write here just asks again after a restart.
  }
}
