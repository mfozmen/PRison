/** A check the user has named, and whether they said it blocks the merge.
 *
 * GitHub does not tell a non-admin which checks are required, which is the
 * whole reason this feature exists — but the user knows, and saying so is what
 * lets the board draw a gate differently from a job you merely like to watch. */
export type TrackedCheck = { name: string; required: boolean };

/** As stored. A bare string is a name the user gave before there was anything
 * to say about it, and those were all treated as blocking — so it reads as
 * required, and nothing already in localStorage changes meaning on upgrade. */
export type StoredCheck = string | TrackedCheck;

export type TrackedChecks = {
  orgs: Record<string, StoredCheck[]>;
  repos: Record<string, StoredCheck[]>;
};
export const EMPTY_TRACKED: TrackedChecks = { orgs: {}, repos: {} };

/** How the board should draw a check name it has in hand:
 * `required` and `optional` are what the user said, `unknown` is the honest
 * answer for a name they never mentioned — which is most of them, and is the
 * meaning the dashed chip has always carried. */
export type Requirement = "required" | "optional" | "unknown";

function normalize(entry: StoredCheck): TrackedCheck | null {
  if (typeof entry === "string") return entry ? { name: entry, required: true } : null;
  if (typeof entry !== "object" || entry === null) return null;
  const { name, required } = entry as Partial<TrackedCheck>;
  return typeof name === "string" && name ? { name, required: required !== false } : null;
}

/** Normalized entries, with unusable ones dropped. Exported because the
 * settings form reads the same stored shape straight out of props. */
export function normalizeAll(entries: StoredCheck[] | undefined): TrackedCheck[] {
  if (!entries) return [];
  return entries.map(normalize).filter((c): c is TrackedCheck => c !== null);
}

/**
 * Returns the configured checks for a repo:
 * 1. if cfg.repos[repo] is defined → return it (repo override beats org default)
 * 2. else if cfg.orgs[repo.split("/")[0]] is defined → return it (org default)
 * 3. else → []
 *
 * Entries are normalized, and unusable ones — a number, a nameless object —
 * are dropped rather than thrown on: this config is hand-editable localStorage.
 */
export function resolveTracked(repo: string, cfg: TrackedChecks): TrackedCheck[] {
  const repoVal = cfg.repos[repo];
  if (Array.isArray(repoVal)) return normalizeAll(repoVal);
  const orgVal = cfg.orgs[repo.split("/")[0]];
  return Array.isArray(orgVal) ? normalizeAll(orgVal) : [];
}

/** What the user said about a check name on this repo, for a check GitHub did
 * report. Unknown when they never named it — which must stay distinguishable
 * from "they said it doesn't block", or the dashed chip stops meaning anything. */
export function checkRequirement(
  repo: string,
  name: string,
  cfg: TrackedChecks,
): Requirement {
  const tracked = resolveTracked(repo, cfg).find((c) => c.name === name);
  if (!tracked) return "unknown";
  return tracked.required ? "required" : "optional";
}

/**
 * Returns tracked checks that are NOT in presentCheckNames.
 * Uses resolveTracked; filters names NOT present (case-sensitive exact match);
 * dedupes by name, first entry wins; preserves order of the tracked list.
 */
export function awaitingChecks(
  repo: string,
  presentCheckNames: string[],
  cfg: TrackedChecks,
): TrackedCheck[] {
  const present = new Set(presentCheckNames);
  const seen = new Set<string>();
  const result: TrackedCheck[] = [];
  for (const check of resolveTracked(repo, cfg)) {
    if (seen.has(check.name)) continue;
    seen.add(check.name);
    if (!present.has(check.name)) result.push(check);
  }
  return result;
}

/**
 * Safe JSON.parse from localStorage.
 * Returns EMPTY_TRACKED on: null, JSON parse error, non-object result.
 * Coerces missing orgs/repos keys to {}.
 */
export function parseTracked(raw: string | null): TrackedChecks {
  if (raw === null) return EMPTY_TRACKED;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_TRACKED;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return EMPTY_TRACKED;
  }
  const obj = parsed as Record<string, unknown>;
  const map = (value: unknown): Record<string, StoredCheck[]> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, StoredCheck[]>)
      : {};
  return { orgs: map(obj.orgs), repos: map(obj.repos) };
}
