import type { StuckPr, ReadyPr } from "./types";
import { needsReview } from "./suggest";

/** Check names the user has written off: broken, flaky, or simply not theirs.
 *
 * Kept apart from tracked checks on purpose. A tracked check answers "which
 * checks does this repo gate on", which is a per-repo answer and so a repo list
 * REPLACES the owner's. This is a blocklist — there is no question for a repo
 * to answer differently, so the two scopes add up. */
export type IgnoredChecks = {
  orgs: Record<string, string[]>;
  repos: Record<string, string[]>;
};

export const EMPTY_IGNORED: IgnoredChecks = { orgs: {}, repos: {} };

const names = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((n): n is string => typeof n === "string" && n !== "") : [];

/** Every name ignored on this repo — the owner's, then the repo's own. */
export function resolveIgnored(repo: string, cfg: IgnoredChecks): string[] {
  const owner = repo.split("/")[0];
  return Array.from(new Set([...names(cfg.orgs[owner]), ...names(cfg.repos[repo])]));
}

export function isIgnoredCheck(repo: string, name: string, cfg: IgnoredChecks): boolean {
  return resolveIgnored(repo, cfg).includes(name);
}

/** Ignoring happens from a chip on one PR, so it lands on that PR's repo — the
 * narrowest scope that explains the click. Widening it to the owner is a
 * deliberate act, and Settings is where it is made. */
export function ignoreCheck(repo: string, name: string, cfg: IgnoredChecks): IgnoredChecks {
  const current = names(cfg.repos[repo]);
  if (current.includes(name)) return cfg;
  return { ...cfg, repos: { ...cfg.repos, [repo]: [...current, name] } };
}

/** Undoes it in whichever scope did it: the chip reads the same either way, so
 * a menu item that only reached the repo would look broken on an owner-wide
 * entry. */
export function unignoreCheck(repo: string, name: string, cfg: IgnoredChecks): IgnoredChecks {
  const without = (map: Record<string, string[]>, key: string) => {
    const kept = names(map[key]).filter((n) => n !== name);
    const next = { ...map };
    if (kept.length > 0) next[key] = kept;
    else delete next[key];
    return next;
  };
  return {
    orgs: without(cfg.orgs, repo.split("/")[0]),
    repos: without(cfg.repos, repo),
  };
}

/** Safe JSON.parse from localStorage — same contract as parseTracked: never
 * throws, coerces a missing scope to {}. */
export function parseIgnored(raw: string | null): IgnoredChecks {
  if (raw === null) return EMPTY_IGNORED;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_IGNORED;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return EMPTY_IGNORED;
  }
  const obj = parsed as Record<string, unknown>;
  const map = (value: unknown): Record<string, string[]> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, string[]>)
      : {};
  return { orgs: map(obj.orgs), repos: map(obj.repos) };
}

/** A PR the stuck list is holding only because a check the user threw out went
 * red. It belongs with the ones that can be merged — that is the whole point of
 * saying a check is broken.
 *
 * BLOCKED does not stand in the way, even though GitHub means "I will not merge
 * this": a required check going red is exactly what puts a PR there, so it is
 * the state the user was looking at when they called the check broken, and
 * refusing to promote it would make ignoring useless precisely where it is
 * needed. The board already makes that leap for a green BLOCKED PR
 * (isReadyViaBlocked) — once the ignored result is discounted, this is the same
 * PR. A conflict and a review gate do stand in the way: both outlive any check
 * result, and neither is what the user answered for. Ignoring a check says
 * "this result means nothing to me", never "merge it anyway". */
export function readyDespiteIgnored(pr: StuckPr, cfg: IgnoredChecks): boolean {
  if (pr.failing.length + pr.pending.length === 0) return false;
  if (pr.mergeState === "DIRTY") return false;
  if (needsReview(pr.reviewDecision)) return false;
  const ignored = new Set(resolveIgnored(pr.repo, cfg));
  return [...pr.failing, ...pr.pending].every((name) => ignored.has(name));
}

/** The same PR as the ready list draws them. It never came from the ready query
 * — that query cannot see past the red check — so its ready-to-merge shape is
 * built here from what the stuck payload already carries. */
export function readyFromStuck(pr: StuckPr): ReadyPr {
  return {
    id: pr.id,
    title: pr.title,
    url: pr.url,
    number: pr.number,
    repo: pr.repo,
    readySince: pr.stuckSince,
    needsUpdate: pr.mergeState === "BEHIND",
    checkNames: pr.checkNames,
    viaBlocked: false,
    ignoredChecks: [...pr.failing, ...pr.pending],
  };
}
