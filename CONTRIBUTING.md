# Contributing to PRison

Thanks for helping out. PRison is a small, read-only Next.js dashboard; the bar
for contributing is low, but a few conventions keep the history clean.

## Tech stack

Next.js (App Router) + TypeScript · GitHub Personal Access Token (encrypted cookie) ·
`@octokit/graphql` · Tailwind CSS v4 · Vitest + Testing Library.

Design tokens live in [`docs/DESIGN.md`](docs/DESIGN.md); UI audit notes in
[`docs/UI-AUDIT.md`](docs/UI-AUDIT.md).

## Local checks

```sh
npm test           # all tests
npm run test:cov   # tests + coverage (lcov in coverage/)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
```

## Installing

The repo pins the public npm registry in `.npmrc`, but npm's precedence is
`cli flag > environment > project .npmrc` — so an `npm_config_registry` exported
by a corporate shell profile silently wins and rewrites every `resolved` URL in
`package-lock.json` to that private mirror. That breaks `npm ci` on the public CI
runner and leaks an internal hostname from this public repository.

A `preinstall` hook (`scripts/check-registry.mjs`) refuses the install rather than
let that happen. If it fires, a CLI flag beats the environment:

```sh
npm install --registry=https://registry.npmjs.org/
```

`lib/public-registry.test.ts` is the backstop: it fails if any `resolved` host in
the lockfile is not the public registry.

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`.
- **Branches:** `type/short-slug` (e.g. `feat/org-switcher`).
- **One change per PR.** Keep diffs focused.
- **English only** — code, comments, commit messages, PR descriptions.
- **TDD:** add or update tests with the change; keep the suite green.

## How a PR merges

`main` is protected. To merge, a PR must:

- pass **CI** (lint + typecheck + tests with coverage),
- pass the **SonarCloud** quality gate,
- have a **CODEOWNERS review**.

The **Claude AI review** runs on every PR but is advisory (it never blocks).

## CI workflow setup (maintainers)

Three workflows live in `.github/workflows/`. CI needs no secrets. The other two
skip silently until their secret is configured, so PRs are never blocked before
setup:

| Workflow | Secret | How to get it |
|---|---|---|
| `sonarcloud.yml` | `SONAR_TOKEN` | Import the repo at [sonarcloud.io](https://sonarcloud.io), turn **off** Automatic Analysis (Administration → Analysis Method), then create a token under My Account → Security. |
| `claude-review.yml` | `CLAUDE_CODE_OAUTH_TOKEN` | Install the [Claude GitHub App](https://github.com/apps/claude), run `claude setup-token` locally, and paste the token. Uses the Claude subscription, not an API key. |

The AI review only runs on PRs from this repo (not forks) and on `@claude`
comments from collaborators and above.
