import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * PRison is a public repository. Fixtures must never name a real repository,
 * organization, or person.
 *
 * This guard is an ALLOWLIST, not a denylist: a denylist would have to spell out
 * the very names we are trying to keep out of this repo.
 *
 * SCOPE — read this before trusting a green run. The guard reads *structured*
 * fixture fields: the owner AND repository halves of `nameWithOwner:` / `repo:` /
 * `github.com/<owner>/<repo>`, plus `login:`, `author:`, and the `owners` prop.
 * It cannot see a *name* sitting in free-form prose — a code comment, an `it(...)`
 * description, or a string like `` message: "`someone` forbids access" ``.
 * Nothing short of a denylist could, and a denylist is what we are avoiding.
 *
 * It does catch issue/PR references and GitHub comment ids anywhere — in prose, in
 * a comment, or in a bare `number:` field — because those have a recognizable
 * *shape* rather than a name (see TICKET_PATTERNS). Three such leaks slipped past
 * the name check before this was added, and two were bare `number:` values: that
 * is where a fixture copied from a live GraphQL `search` node keeps the real PR
 * number long after its `nameWithOwner` and `login` have been genericized.
 *
 * Names in prose remain the reviewer's job, per REVIEW.md §1. A green run means
 * "no real name in a structured fixture field, and no foreign ticket reference
 * anywhere", not "no real name in the repo".
 *
 * Adding a name below is a deliberate act — do not add a real one.
 */
export const ALLOWED_OWNERS = new Set([
  // Placeholder organizations: RFC-2606-style reserved names and the classic
  // fictional companies. Never add a real organization here.
  "acme",
  "beta",
  "example",
  "globex",
  "initech",
  "widgets-inc",
  // Short throwaway owners used in tight fixtures.
  "a",
  "b",
  "org",
  // GitHub's own documentation user.
  "octocat",
  // Placeholder people. Never add a real colleague here.
  "alice",
  "bob",
  "carol",
  "dave",
  "eve",
  "testuser",
  "unknown",
  "ghost",
  // "me" stands in for the authenticated viewer (mirrors GitHub's @me qualifier).
  "me",
  // Bot logins used in fixtures.
  "github-actions",
  // The repository owner's own public handle.
  "mfozmen",
  // Deliberately invalid login, used to test rejection.
  "a b",
  // Public open-source maintainer, appearing only in vendored upstream docs
  // (the canonical shadcn/ui <AvatarImage> example). Not an employer identity.
  "shadcn",
  // GitHub's own discussions org (github.com/orgs/community/discussions/…).
  "community",
  // Public GitHub App slug (github.com/apps/claude), linked from CONTRIBUTING.md.
  "claude",
  // The release tool, linked from RELEASING.md. A public project, not an identity.
  "release-it",
]);

// The repository half of "owner/repo". Real private repo names are exactly what
// REVIEW.md §1 bans, so this half is checked too — not just the owner.
export const ALLOWED_REPOS = new Set([
  "alpha",
  "beta",
  "gamma",
  "api",
  "web",
  "worker",
  "repo",
  "cn",
  "PRison",
  // github.com/release-it/release-it — the tool's own repo, linked from RELEASING.md.
  "release-it",
]);

// Single-letter throwaway repos: acme/a, acme/b, …
const THROWAWAY_REPO = /^[a-z]$/;

// github.com/<segment>/ is only an owner when <segment> is a user or org.
// These are GitHub's own top-level routes, and nothing after them is an identity.
const GITHUB_RESERVED_PATHS = new Set([
  "settings",
  "features",
  "login",
  "notifications",
  "pulls",
  "issues",
]);

// …but for THESE routes the identity moves to the SECOND segment:
// github.com/orgs/<org>/teams, github.com/apps/<slug>, github.com/marketplace/<vendor>.
// Skipping the whole match here would wave a real org straight through.
const IDENTITY_IN_SECOND_SEGMENT = new Set(["orgs", "apps", "marketplace"]);

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage", "dist"]);
// Lockfiles are machine-generated and full of upstream package metadata
// ("sponsors" funding URLs, maintainer handles) — never authored here.
const SKIP_FILES = new Set(["package-lock.json"]);
const SCAN_EXT = /\.(ts|tsx|md|mjs|json|yml|yaml)$/;

export const ROOT = join(__dirname, "..");

/**
 * Exemptions are the guard's blind spot, so they are granted per-check rather
 * than per-file — an early version exempted these three files wholesale, and a
 * real PR number promptly landed in two of them, as a documentation example.
 *
 * Only the test may contain real-looking NAMES: it exists to prove the guard
 * fires, so a real-looking owner in one of its fixture fields is the assertion,
 * not a leak.
 */
export const NAME_SCAN_EXEMPT = new Set(["lib/generic-fixtures.test.ts"]);

/**
 * These three necessarily carry ticket-SHAPED text — they document and exercise
 * the ticket patterns. Nothing checks them, so their examples must be invented.
 * If you add one, invent the number. Do not paste a real one.
 */
export const TICKET_SCAN_EXEMPT = new Set([
  "lib/generic-fixtures.ts",
  "lib/generic-fixtures.test.ts",
  "REVIEW.md",
]);

function repoAllowed(name: string): boolean {
  return ALLOWED_REPOS.has(name) || THROWAWAY_REPO.test(name);
}

/**
 * A hex colour is `#` plus 3, 4, 6, or 8 hex digits. An all-digit one (`#334155`,
 * `#030712`) is shape-identical to a ticket reference, so colours are stripped
 * before the ticket scan rather than guessed around by context.
 *
 * Cost of that choice: a standalone `#1234` is both a four-digit colour and a
 * plausible ticket, so it is stripped and missed. A *glued* reference survives —
 * `some-service#4533` has no word boundary before the `#` — and that is the form
 * a cross-repo reference actually takes.
 */
const HEX_COLOUR = /(?<![\w-])#(?:[\da-fA-F]{8}|[\da-fA-F]{6}|[\da-fA-F]{4}|[\da-fA-F]{3})\b/g;

/**
 * Issue/PR references and GitHub-minted ids that look copied from a real tracker.
 * These are patterns, not names, so they work where the allowlist cannot: a real
 * number pasted into a comment or a fixture.
 *
 * This repo's own PR numbers are two digits, so four or more is a foreign tracker.
 */
const TICKET_PATTERNS: RegExp[] = [
  // "some-service#90210", and — colours already stripped — "Fixes #90210" too.
  /#(\d{4,})\b/g,
  // ".../pull/90211#discussion_r…" — here the number precedes the "#".
  /\/(?:pull|issues)\/(\d{4,})/g,
  // GitHub mints these; they are always real, and often pasted with the URL
  // trimmed off, leaving only the anchor fragment.
  /(discussion_r\d{6,}|issuecomment-\d{6,}|pullrequestreview-\d{6,})/g,
  // The bare field. This is where the real leaks lived: a fixture copied from a
  // live `search` node keeps `number:` long after its `nameWithOwner` and `login`
  // have been genericized. The optional quote covers pasted JSON (`"number": 90210`),
  // which is the likeliest form of that paste.
  /\bnumber["']?\s*:\s*(\d{4,})/g,
];

/** Every disallowed identifier in `source`, as `"<kind>:<name>"`. */
export function scanSource(source: string): string[] {
  const bad: string[] = [];

  const withoutColours = source.replace(HEX_COLOUR, "");
  for (const re of TICKET_PATTERNS) {
    for (const m of withoutColours.matchAll(re)) bad.push(`ticket:${m[1]}`);
  }

  const checkOwner = (owner: string) => {
    if (!ALLOWED_OWNERS.has(owner)) bad.push(`owner:${owner}`);
  };
  const checkPair = (owner: string, repo?: string) => {
    checkOwner(owner);
    if (repo && !repoAllowed(repo)) bad.push(`repo:${repo}`);
  };

  // "owner/repo" (repo half optional) — both halves are validated.
  for (const re of [
    /nameWithOwner:\s*["']([\w.-]+)(?:\/([\w.-]+))?["']/g,
    /\brepo:\s*["']([\w.-]+)(?:\/([\w.-]+))?["']/g,
  ]) {
    for (const m of source.matchAll(re)) checkPair(m[1], m[2]);
  }

  for (const m of source.matchAll(/github\.com\/([\w.-]+)(?:\/([\w.-]+))?/g)) {
    // github.com/<user>.png is an avatar, not a repo path.
    const first = m[1].replace(/\.(png|jpe?g|gif|svg)$/i, "");
    if (IDENTITY_IN_SECOND_SEGMENT.has(first)) {
      if (m[2]) checkOwner(m[2]);
      continue;
    }
    if (GITHUB_RESERVED_PATHS.has(first)) continue;
    checkPair(first, m[2]);
  }

  for (const re of [/\blogin:\s*["']([^"']+)["']/g, /\bauthor:\s*["']([^"']+)["']/g]) {
    for (const m of source.matchAll(re)) checkOwner(m[1]);
  }

  // The owners prop: a bracketed list of logins.
  for (const m of source.matchAll(/owners=\{\[([^\]]+)\]\}/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().replace(/^["']|["']$/g, "");
      if (name) checkOwner(name);
    }
  }

  return bad;
}

/**
 * Every scannable file under `dir`, recursively.
 *
 * lstatSync, not statSync: a symlinked directory would otherwise let the walk
 * escape `dir` or loop forever on a cycle.
 */
export function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry)) continue;
    const full = join(dir, entry);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walk(full, out);
    else if (SCAN_EXT.test(entry)) out.push(full);
  }
  return out;
}

/** Disallowed identifiers across the repository, as `"<file>: <kind>:<name>"`. */
export function scanRepo(root: string = ROOT): string[] {
  const offenders: string[] = [];
  for (const file of walk(root)) {
    const rel = relative(root, file);
    for (const bad of scanSource(readFileSync(file, "utf8"))) {
      const isTicket = bad.startsWith("ticket:");
      if (isTicket && TICKET_SCAN_EXEMPT.has(rel)) continue;
      if (!isTicket && NAME_SCAN_EXEMPT.has(rel)) continue;
      offenders.push(`${rel}: ${bad}`);
    }
  }
  return offenders;
}
