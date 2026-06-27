# PRison

[![CI](https://github.com/mfozmen/PRison/actions/workflows/ci.yml/badge.svg)](https://github.com/mfozmen/PRison/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=coverage)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)

A read-only GitHub pull-request dashboard that answers two questions:

- **Your stuck PRs** — open PRs you authored whose checks are failing or still pending, with how long they have been blocked.
- **Your review backlog** — PRs waiting for your review, with how long you have been the blocker.

PRison is scoped to one GitHub organization at a time. A tenant switcher in the header lets you change the active org (your last selection is remembered in `localStorage`). All interactions are read-only; the UI surfaces "suggested action" deep-links so you can jump straight to GitHub to act.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Auth | NextAuth v5 (GitHub OAuth) |
| GitHub data | `@octokit/graphql` (GitHub GraphQL API v4) |
| Styling | Tailwind CSS v4 |
| Testing | Vitest + Testing Library |

Design tokens (palette, badge colors, typography, spacing) are documented in [`docs/DESIGN.md`](docs/DESIGN.md).

## GitHub OAuth App Setup

PRison authenticates users via a GitHub OAuth App. You need to create one before running locally or deploying.

1. Go to **GitHub Settings > Developer settings > OAuth Apps > New OAuth App**.
2. Fill in the fields:
   - **Application name**: PRison (or any name you like)
   - **Homepage URL**: `http://localhost:3000` (dev) or your Vercel URL (prod)
   - **Authorization callback URL**:
     - Development: `http://localhost:3000/api/auth/callback/github`
     - Production: `https://<your-app>.vercel.app/api/auth/callback/github`
3. Click **Register application**, then click **Generate a new client secret**.
4. Note the **Client ID** and **Client Secret** — you will need them as env vars.

**Required OAuth scopes:** `read:org repo`

The `repo` scope is required because GitHub's OAuth model does not offer a read-only scope for private-repository pull requests. The access token is stored server-side only (in the JWT) and is never sent to the browser.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values. Never commit real credentials.

| Variable | Purpose |
|---|---|
| `AUTH_GITHUB_ID` | OAuth App client ID (from step 3 above) |
| `AUTH_GITHUB_SECRET` | OAuth App client secret (from step 3 above) |
| `AUTH_SECRET` | Random secret used to sign NextAuth JWTs |
| `AUTH_URL` | Full base URL of the app (`http://localhost:3000` for local dev) |

Generate `AUTH_SECRET` with either:

```sh
npx auth secret
# or
openssl rand -base64 32
```

## Local Development

```sh
npm install
cp .env.example .env.local
# Edit .env.local and fill in the four variables above
npm run dev
```

The app starts at `http://localhost:3000`. Sign in with GitHub to see your dashboard.

**Note:** `.npmrc` pins the public npm registry (`registry=https://registry.npmjs.org/`), so no private registry configuration is needed.

## Testing

```sh
npm test           # run all tests once
npm run test:cov   # run tests with V8 coverage report
npm run typecheck  # TypeScript type check (no emit)
npm run lint       # ESLint
```

Coverage output lands in `coverage/` (lcov format, consumed by SonarCloud).

## Deployment (Vercel)

PRison deploys to Vercel with zero configuration beyond environment variables.

1. Push this repository to GitHub (or fork it).
2. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
3. Import the repository. Vercel detects Next.js automatically.
4. Under **Environment Variables**, add the four variables from the table above:
   - Set `AUTH_URL` to your Vercel deployment URL, e.g. `https://prison-abc123.vercel.app`.
   - Set `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` from your OAuth App.
   - Set `AUTH_SECRET` to a random 32-byte base64 string.
5. Click **Deploy**.

No custom domain or paid plan is required. The free Vercel tier is sufficient.

After the first deploy, update your GitHub OAuth App's **Authorization callback URL** to `https://<your-vercel-url>/api/auth/callback/github`.

## CI and Quality Gates

Three GitHub Actions workflows run on every pull request:

### CI (`.github/workflows/ci.yml`)

Triggered on pull requests and pushes to `main`. Runs on Node 22:

1. `npm ci` — reproducible install
2. `npm run lint` — ESLint
3. `npm run typecheck` — TypeScript
4. `npm run test:cov` — Vitest with coverage
5. Uploads `coverage/lcov.info` as a build artifact for SonarCloud to consume.

### SonarCloud (`.github/workflows/sonarcloud.yml`)

Triggered on pull requests and pushes to `main`. Runs test coverage then submits results to SonarCloud for quality gate and coverage tracking.

**Setup required:**

1. Connect the repository at [sonarcloud.io](https://sonarcloud.io) (sign in with GitHub, import the repo).
2. Disable **Automatic Analysis** in the SonarCloud project settings (Administration > Analysis Method) — the workflow handles analysis instead.
3. Add a repository secret named `SONAR_TOKEN` (generate it at sonarcloud.io under My Account > Security).

The workflow skips the scan step silently when `SONAR_TOKEN` is not set, so PRs are not blocked before the project is connected.

### Claude AI Review (`.github/workflows/claude-review.yml`)

An advisory AI code review runs on every PR using `anthropics/claude-code-action@v1`. It posts inline comments for concrete findings and a top-level summary comment. The review is advisory — it does not approve or block merges.

**Setup required:**

1. Install the [Claude GitHub App](https://github.com/apps/claude) on the repository.
2. Generate a Claude subscription token locally with `claude setup-token`.
3. Add a repository secret named `CLAUDE_CODE_OAUTH_TOKEN` with that token.

The reviewer uses the Claude subscription quota (not an Anthropic API key). For security, it only runs on PRs from the repository itself (not forks) and on `@claude` comments from collaborators or above.

## Contributing

Contributions are welcome. Please follow these conventions:

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, etc.)
- **Branches:** `type/short-slug`, e.g. `feat/org-switcher`, `fix/auth-redirect`
- **PRs:** One change per PR; keep diffs focused.
- **Language:** English only — code, comments, commit messages, and PR descriptions.
- **Checks:** All PRs must pass CI (lint + typecheck + tests) and the SonarCloud quality gate. The Claude AI review is advisory.
- **Review:** `main` is protected; a CODEOWNERS review is required before merge.

## License

[MIT](LICENSE) — Copyright (c) 2026 Mehmet Fahri Ozmen
