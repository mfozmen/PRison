# Review rules

Rules the pre-commit / pre-push review must enforce, in addition to the usual
correctness and quality checks.

## 1. No real-world identities — this repository is public

**Severity: critical. Blocking, at any confidence.**

Nothing in this repository — source, tests, fixtures, comments, commit messages,
branch names, PR descriptions, docs, or screenshots — may name a real entity from
the author's employer or any other company:

- private repository names
- organization or company logins
- colleagues' usernames, real names, or email addresses
- internal ticket / issue / PR numbers
- internal hostnames, service names, dashboards, or URLs

Use the reserved placeholders instead: `acme`, `beta`, `globex`, `initech`,
`widgets-inc`, `octocat`, `alice`, `bob`, `carol`, `dave`, `eve`.

Build test data with the factories in `lib/fixtures.ts` rather than writing
literals by hand. `lib/generic-fixtures.test.ts` checks this with an
**allowlist** — a denylist would have to spell out the very names we are keeping
out. If that test fails, do not add the offending name to the allowlist: change
the fixture.

**What the guard covers.** *Names* only in structured fields — the owner and
repository halves of `nameWithOwner:` / `repo:` / `github.com/<owner>/<repo>`,
plus `login:`, `author:`, and the `owners` prop. *Ticket references* anywhere, because
those have a shape rather than a name: `service#90210`, `Fixes #90210`,
`/pull/90211`, `number: 90210`, `"number": 90210`, and GitHub-minted anchor ids
(`discussion_r…`, `issuecomment-…`, `pullrequestreview-…`).

**What it cannot cover:** a *name* in free-form prose — a code comment, an
`it(...)` description, a commit message, or a string like
`` message: "`someone` forbids access" ``. No allowlist can. A green run means
"no real name in a structured field, and no foreign ticket reference anywhere",
not "no real name in the repo". **Names in prose are the reviewer's job** — that
is rule 1's main reason for existing.

> A commit message cannot be un-published. Git history is rewritable only with a
> force-push, and GitHub keeps orphaned commits reachable by SHA long after. Catch
> these before the commit, not after.

Reviewer: read the diff for identifiers that look real. A name that is plausibly a
private repo (`some-service`, `internal-api`) or a person (`jdoe`, `mfahri`) is a
finding even when you cannot prove who it belongs to — the cost of a false positive
is one rename; the cost of a miss is permanent.

## 2. No customer or personal data in fixtures

**Severity: critical. Blocking.**

Never use real PII — names, emails, phone numbers, customer identifiers, account
IDs — in fixtures, seeds, demo data, or test cases. Synthesize it.

## 3. Secrets

**Severity: critical. Blocking.**

No credentials in tracked files. `.env*` is git-ignored except `.env.example`,
which holds empty placeholders only. `AUTH_SECRET` is generated at runtime by
`docker-entrypoint.sh`; `GITHUB_TOKEN` is supplied at run time and lives only in
an encrypted, httpOnly cookie. A token must never reach a response body, a log
line, a URL, a build arg, or an image layer.

If a secret has already been committed, removing the file does not retract it —
flag it and rotate.

## 4. This is not the Next.js you know

See `AGENTS.md`. The pinned Next.js version has breaking changes: APIs,
conventions, and file structure may differ from training data. Check
`node_modules/next/dist/docs/` before asserting that an API is wrong.

## 5. Determinism in tests

Fixtures use fixed values, not randomized fakers. A test that asserts on a date,
a title, or an ordering needs the same value on every run — a random faker makes
a failure irreproducible. Override only the fields a test cares about.
