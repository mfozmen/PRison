import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_POLL_INTERVAL_MS, POLL_INTERVAL_OPTIONS } from "./notify";

/** Where the interval is kept, overridable so tests never touch a real /data
 * and a host that mounts its volume elsewhere can say so. */
export const INTERVAL_FILE_ENV = "PRISON_POLL_INTERVAL_FILE";

/** The container's persistent volume, where the generated AUTH_SECRET already
 * lives — the one directory that survives a `docker run` with a new image. */
export const DEFAULT_INTERVAL_FILE = "/data/poll-interval";

/** Exported because where the setting lives is worth being able to assert on,
 * and worth being able to answer without reading it. */
export function intervalFilePath(): string {
  return process.env[INTERVAL_FILE_ENV] ?? DEFAULT_INTERVAL_FILE;
}

/** The dashboard's answer, held for readers that have no browser: the
 * menu-bar plugin is a shell script and cannot see localStorage, and two
 * schedules that disagree are how an account's hourly budget disappears.
 *
 * Kept in memory as well as on disk, because /data is a Docker volume that a
 * development server does not have and a hardened deployment may mount
 * read-only — neither is a reason for the setting to stop working while the
 * process is alive. Keyed by path, so pointing the environment somewhere else
 * reads that file rather than answering from a memory of the last one. */
let cached: { file: string; ms: number } | null = null;

function offered(ms: number): boolean {
  return POLL_INTERVAL_OPTIONS.some((o) => o.ms === ms);
}

export function readStoredInterval(): number {
  if (cached?.file === intervalFilePath()) return cached.ms;
  try {
    const ms = Number(readFileSync(intervalFilePath(), "utf8").trim());
    if (offered(ms)) return ms;
  } catch {
    // Never written, or unreadable. Either way the default is the answer.
  }
  return DEFAULT_POLL_INTERVAL_MS;
}

/** Returns false only for a value the picker does not offer — a write that
 * cannot reach the disk still counts, since the running process now knows. */
export function writeStoredInterval(ms: number): boolean {
  if (!offered(ms)) return false;
  cached = { file: intervalFilePath(), ms };
  try {
    mkdirSync(dirname(intervalFilePath()), { recursive: true });
    writeFileSync(intervalFilePath(), String(ms));
  } catch {
    // In memory is enough for as long as this process lives. Nothing rewrites
    // it on the next start — the dashboard announces the interval only when it
    // changes — so a host that cannot write here falls back to the default
    // after a restart, until the next time somebody picks one.
  }
  return true;
}
