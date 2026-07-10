import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, lstatSync } from "node:fs";
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
 * Two further shapes are checked, both learned from a real escape: a private
 * repository name reached the public repo in two commit messages.
 *
 *   * CROSS_REPO_REF — `some-service#66`. A number glued to a name is a reference
 *     to *another* repository, and the name is right there. Note this needs no
 *     digit floor: TICKET_PATTERNS requires four digits because a bare `#66`
 *     could be anything, but `some-service#66` is unambiguous.
 *   * SCRUB_SURVIVOR — `acme/<repo>`. A scrub rewrites the owner to a
 *     fictional company and can leave the repository half behind; an unknown repo
 *     under a *placeholder* owner is that half-finished rewrite, and nothing else.
 *
 * The guard also reads COMMIT MESSAGES, not just files (see scanCommitMessages).
 * That is where the escaped name hid: no blob ever contained it, so a file-only
 * scan was green while the identifier sat in the public history — and `release-it`
 * was about to copy it into CHANGELOG.md.
 *
 * Names in prose remain the reviewer's job, per REVIEW.md §1. A green run means
 * "no real name in a structured fixture field, no foreign ticket reference, and
 * no cross-repo reference or scrub survivor anywhere — in any file or commit
 * message", not "no real name in the repo".
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
  // Generic dummy repositories in tracked-checks fixtures: acme/app, acme/backend, …
  "app",
  "backend",
  "frontend",
]);

/**
 * The owners a scrub substitutes IN — fictional companies, never real ones.
 * A repository name under one of these that is not in ALLOWED_REPOS is the
 * signature of a rewrite that replaced the owner and forgot the repo.
 *
 * Deliberately a strict subset of ALLOWED_OWNERS, because every member also
 * claims the token before a `/`:
 *   * `mfozmen` — `mfozmen/<branch>` is how a merge commit names a branch.
 *   * `org`     — `Org/StuckPr` is how a TypeScript union names two types.
 *   * `example` — a common word and directory: `example/Button.tsx` is a path,
 *                 not a leak, and no scrub of ours substitutes it.
 */
export const SCRUB_OWNERS = new Set(["acme", "globex", "initech", "widgets-inc"]);

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

const ALLOWED_REPOS_LOWER = new Set([...ALLOWED_REPOS].map((r) => r.toLowerCase()));

/**
 * A trailing dot ends a sentence, not a name. Stripped character by character:
 * `/\.+$/` backtracks super-linearly on a run of dots, and this is called per
 * match on scanned text.
 */
function stripTrailingDots(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === ".") end--;
  return s.slice(0, end);
}

/**
 * Repo names are compared case-insensitively — `PRison` and `prison` are the same
 * repository, and a guard that passed the second would be theatre. A trailing dot,
 * as when a name ends a sentence, is stripped: it is punctuation, not the name.
 *
 * One predicate for every path: the structured `owner/repo` fields and the two
 * prose detectors below. Two predicates over one set drift as the set grows.
 */
function repoAllowed(name: string): boolean {
  const bare = stripTrailingDots(name).toLowerCase();
  return ALLOWED_REPOS_LOWER.has(bare) || THROWAWAY_REPO.test(bare);
}

type PackageJson = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

/** Dependency + devDependency names, each reduced to the bare form used in an issue link. */
export function bareDependencyNames(pkg: PackageJson): Set<string> {
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  // A scoped package `@scope/name` is referenced bare as `name`.
  return new Set(names.map((n) => n.replace(/^@[^/]+\//, "").toLowerCase()));
}

/**
 * Names this repository legitimately references: its own declared dependencies.
 * `next#456` or `vitest#42` in a commit is an upstream issue link, not a leaked
 * private repo — but `some-service#456` is. Derived from package.json so the set
 * never drifts from what the project actually depends on.
 *
 * Two accepted blind spots, both erring toward a harmless false negative:
 *   * a private repo that happens to share a public dependency's exact name slips
 *     through — negligible, and the collision would be a strange coincidence.
 *   * a public project this repo does NOT depend on (`webpack#12`) is still
 *     flagged, and a 4+ digit dependency ref (`next#12345`) is caught by
 *     TICKET_PATTERNS regardless. Both surface as red CI on the PR, before merge,
 *     and are cleared by rewording the commit — friction, not a leak.
 */
const DECLARED_DEPS = bareDependencyNames(
  JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as PackageJson,
);

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

/**
 * `some-service#66` — a number glued to a name. The name IS the other repository,
 * so it is caught however small the number: a bare `#66` could be anything, but
 * `some-service#66` says which repo outright. This is the shape that escaped.
 *
 * Only 1–3 digits, because TICKET_PATTERNS already claims four or more. Splitting
 * the range stops both rules from reporting `some-service#90210` twice.
 *
 * The lookbehind blocks a match starting mid-token — without it `some-service#66`
 * would also match at `service#66`. It excludes `#`, so a `## Heading` cannot
 * start one, and `/`, so a URL path cannot.
 *
 * A *spaced* `#66` is this repo's own PR, not a cross-repo reference, so only the
 * glued form is caught. A name in DECLARED_DEPS is a public upstream link, not a
 * leak, and is skipped (see the loop in scanSource).
 */
const CROSS_REPO_REF = /(?<![\w/#-])([A-Za-z][\w.-]*)#\d{1,3}\b/g;

/**
 * `acme/<repo>` — a placeholder owner still carrying a real repository name.
 *
 * Owners are escaped before they reach the alternation. None needs it today, but
 * an owner with a `.` in it would otherwise become a wildcard, and a guard that
 * silently widens is the failure this file exists to prevent.
 */
const SCRUB_SURVIVOR = new RegExp(
  String.raw`(?<![\w/.-])(${[...SCRUB_OWNERS].map(escapeRegExp).join("|")})/([A-Za-z][\w.-]*)`,
  "gi",
);

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\-]/g, String.raw`\$&`);
}

/** A single login — empty unless it is disallowed. */
function ownerOffenders(owner: string): string[] {
  return ALLOWED_OWNERS.has(owner) ? [] : [`owner:${owner}`];
}

/** An `owner/repo` pair — both halves validated. */
function pairOffenders(owner: string, repo?: string): string[] {
  const out = ownerOffenders(owner);
  if (repo && !repoAllowed(repo)) out.push(`repo:${repo}`);
  return out;
}

/**
 * Shapes with a recognizable form rather than a name: ticket references, a
 * name glued to a number (another repo), and a repo half under a scrub owner.
 */
function scanShapes(source: string): string[] {
  const out: string[] = [];
  const withoutColours = source.replace(HEX_COLOUR, "");
  for (const re of TICKET_PATTERNS) {
    for (const m of withoutColours.matchAll(re)) out.push(`ticket:${m[1]}`);
  }
  // A declared dependency is a public upstream (`next#456`), not a leak.
  for (const m of source.matchAll(CROSS_REPO_REF)) {
    if (!repoAllowed(m[1]) && !DECLARED_DEPS.has(m[1].toLowerCase())) out.push(`ticket:${m[0]}`);
  }
  for (const m of source.matchAll(SCRUB_SURVIVOR)) {
    if (!repoAllowed(m[2])) out.push(`repo:${stripTrailingDots(m[2])}`);
  }
  return out;
}

/** Structured `owner/repo` fields: `nameWithOwner:`, `repo:`, and github.com URLs. */
function scanStructuredFields(source: string): string[] {
  const out: string[] = [];
  for (const re of [
    /nameWithOwner:\s*["']([\w.-]+)(?:\/([\w.-]+))?["']/g,
    /\brepo:\s*["']([\w.-]+)(?:\/([\w.-]+))?["']/g,
  ]) {
    for (const m of source.matchAll(re)) out.push(...pairOffenders(m[1], m[2]));
  }
  for (const m of source.matchAll(/github\.com\/([\w.-]+)(?:\/([\w.-]+))?/g)) {
    // github.com/<user>.png is an avatar, not a repo path.
    const first = m[1].replace(/\.(png|jpe?g|gif|svg)$/i, "");
    if (IDENTITY_IN_SECOND_SEGMENT.has(first)) {
      if (m[2]) out.push(...ownerOffenders(m[2]));
    } else if (!GITHUB_RESERVED_PATHS.has(first)) {
      out.push(...pairOffenders(first, m[2]));
    }
  }
  return out;
}

/** Login fields: `login:`, `author:`, and the bracketed `owners` prop. */
function scanLoginFields(source: string): string[] {
  const out: string[] = [];
  for (const re of [/\blogin:\s*["']([^"']+)["']/g, /\bauthor:\s*["']([^"']+)["']/g]) {
    for (const m of source.matchAll(re)) out.push(...ownerOffenders(m[1]));
  }
  for (const m of source.matchAll(/owners=\{\[([^\]]+)\]\}/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().replace(/^["']|["']$/g, "");
      if (name) out.push(...ownerOffenders(name));
    }
  }
  return out;
}

/**
 * Every disallowed identifier in `source`, as `"<kind>:<name>"`, deduplicated.
 *
 * The phases deliberately overlap — a `github.com/acme/<repo>` URL is also a scrub
 * survivor — so an identifier found twice is reported once.
 */
export function scanSource(source: string): string[] {
  return [
    ...new Set([...scanShapes(source), ...scanStructuredFields(source), ...scanLoginFields(source)]),
  ];
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

// A commit message is free-form and contains blank lines, so records are separated
// by NUL and the sha is split from the body by a unit separator — neither byte can
// occur in a message. Both are emitted by git's own `%x00` / `%x1f` placeholders:
// an argv string cannot carry a NUL, so the separator cannot come from this side.
const NUL = "\u0000";
const UNIT = "\u001f";

/**
 * git resolved to an absolute path in a fixed system directory, not via `$PATH`.
 * A guard against identity leaks must not itself execute whatever `git` an
 * attacker-writable `PATH` entry resolves to; the first existing candidate wins,
 * and the bare-name fallback applies only where none is present.
 */
export function resolveGitBin(candidates: string[], exists: (p: string) => boolean): string {
  return candidates.find(exists) ?? "git";
}

const GIT_BIN = resolveGitBin(
  ["/usr/bin/git", "/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"],
  existsSync,
);

/**
 * Every commit message reachable from HEAD, as `[sha, message]`.
 *
 * Throws on a shallow clone rather than scanning the single commit it can see. A
 * `git clone --depth 1` — which is what `actions/checkout` does by default — would
 * otherwise make this guard silently vacuous, and a vacuous guard is worse than
 * none: a green check that means nothing. `.github/workflows/ci.yml` therefore sets
 * `fetch-depth: 0`.
 */
export function readCommitMessages(root: string = ROOT): [string, string][] {
  const git = (...args: string[]) =>
    execFileSync(GIT_BIN, ["-C", root, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

  if (git("rev-parse", "--is-shallow-repository").trim() === "true") {
    throw new Error(
      "generic-fixtures: refusing to scan a shallow clone — it would pass vacuously. " +
        "Fetch the full history (actions/checkout with `fetch-depth: 0`).",
    );
  }

  return git("log", "--format=%H%x1f%B%x00")
    .split(NUL)
    .filter((entry) => entry.includes(UNIT))
    .map((entry) => {
      const cut = entry.indexOf(UNIT);
      return [entry.slice(0, cut).trim().slice(0, 8), entry.slice(cut + 1)] as [string, string];
    });
}

/**
 * Disallowed identifiers in commit messages, as `"<sha>: <kind>:<name>"`.
 *
 * No exemptions: a commit message is never the place to document a leak pattern,
 * and — unlike a file — it cannot be corrected afterwards without rewriting history
 * and force-pushing. Catch it here, or retract the whole repository.
 */
export function scanCommitMessages(root: string = ROOT): string[] {
  const offenders: string[] = [];
  for (const [sha, message] of readCommitMessages(root)) {
    for (const bad of scanSource(message)) offenders.push(`${sha}: ${bad}`);
  }
  return offenders;
}
