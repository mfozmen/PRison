export type TrackedChecks = { orgs: Record<string, string[]>; repos: Record<string, string[]> };
export const EMPTY_TRACKED: TrackedChecks = { orgs: {}, repos: {} };

/**
 * Returns the configured check names for a repo:
 * 1. if cfg.repos[repo] is defined → return it (repo override beats org default)
 * 2. else if cfg.orgs[repo.split("/")[0]] is defined → return it (org default)
 * 3. else → []
 */
export function resolveTracked(repo: string, cfg: TrackedChecks): string[] {
  const repoVal = cfg.repos[repo];
  if (Array.isArray(repoVal)) return repoVal;
  const org = repo.split("/")[0];
  const orgVal = cfg.orgs[org];
  if (Array.isArray(orgVal)) return orgVal;
  return [];
}

/**
 * Returns tracked check names that are NOT in presentCheckNames.
 * Uses resolveTracked; filters names NOT present (case-sensitive exact match);
 * dedupes; preserves order of the tracked list.
 */
export function awaitingChecks(
  repo: string,
  presentCheckNames: string[],
  cfg: TrackedChecks,
): string[] {
  const tracked = resolveTracked(repo, cfg);
  const presentSet = new Set(presentCheckNames);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of tracked) {
    if (!seen.has(name)) {
      seen.add(name);
      if (!presentSet.has(name)) {
        result.push(name);
      }
    }
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
  return {
    orgs: (typeof obj.orgs === "object" && obj.orgs !== null && !Array.isArray(obj.orgs))
      ? (obj.orgs as Record<string, string[]>)
      : {},
    repos: (typeof obj.repos === "object" && obj.repos !== null && !Array.isArray(obj.repos))
      ? (obj.repos as Record<string, string[]>)
      : {},
  };
}
