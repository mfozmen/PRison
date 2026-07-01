# PRison

[![CI](https://github.com/mfozmen/PRison/actions/workflows/ci.yml/badge.svg)](https://github.com/mfozmen/PRison/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=coverage)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)

A read-only GitHub dashboard that shows which pull requests need your attention,
and for how long — across your personal account and every organization you can
access. Three lists, oldest first:

- **Ready to merge** — PRs GitHub reports as mergeable now. Out-of-date branches
  still count and get a **"Needs update"** hint (a bot/manual update handles them).
- **Waiting on your review** — PRs you're blocking others on.
- **Stuck on checks** — your open PRs with failing/pending checks, or otherwise
  blocked from merging (required checks, review, or conflicts).

### Features

- **Tracked checks → Awaiting.** GitHub's API hides "expected" required checks
  (e.g. a manually-triggered `qa/smoke` or automation) from non-admins. Name the
  checks you care about — org defaults plus per-repo overrides, with a
  type-to-search repo picker — and PRison shows them as **"⏳ Awaiting: &lt;name&gt;"**
  on a blocked PR until they report.
- **Grouping** — flat, by repository, or by check.
- **Light / dark theme**, responsive two-column layout, minute-level ages,
  color-coded lists, and a Refresh button.
- **Personal account + per-org filter** in the top-right switcher.
- **Your own access** — sign in with the GitHub CLI or a token; no third-party
  app to approve. Every row deep-links to GitHub; PRison never writes anything.

## Getting started

### Prerequisites

- Node.js 20+
- [`gh` CLI](https://cli.github.com/) installed and signed in — **recommended** (one click, no token needed), or a GitHub Personal Access Token as a fallback.

### 1. Run it locally

```sh
npm install
cp .env.example .env.local        # set AUTH_SECRET: openssl rand -base64 32
npm run dev                       # http://localhost:3000
```

`AUTH_SECRET` is the secret key used to encrypt the session cookie that stores your GitHub token.

Open the app and click **Sign in with GitHub CLI** (recommended if `gh` is installed and signed in). The server reads your CLI token — nothing is stored in the browser.

> [!WARNING]
> `POST /api/token/cli` runs `gh auth token` on the server and mints a session from the host machine's GitHub credentials. PRison is designed to run on **your own machine** — do NOT expose a `gh`-authenticated instance on a reachable network without adding your own access control.

If the GitHub CLI is not installed or not signed in, the app will show a specific message and automatically fall back to the manual token paste form.

If `gh` is not available (e.g. a Vercel deployment or a machine without the CLI), paste a Personal Access Token instead:

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=read:org,repo&description=PRison) → **Generate new token (classic)**.
2. Select the **`read:org`** and **`repo`** scopes, then generate and copy it.

> [!NOTE]
> For SAML SSO orgs, click **Configure SSO** on the token and **Authorize** it
> for those orgs. This is self-service — no org owner approval needed.

Tokens are stored in an encrypted, httpOnly cookie and never reach the browser.

## Run with Docker

```sh
docker build -t prison .
docker run -p 3000:3000 -e AUTH_SECRET="$(openssl rand -base64 32)" prison
```

Or with Compose (set `AUTH_SECRET` in your shell or a `.env` file first):

```sh
AUTH_SECRET="$(openssl rand -base64 32)" docker compose up --build
```

## Deploying to Vercel

Import the repo on the free [Vercel](https://vercel.com) tier, set `AUTH_SECRET`
in the project's environment variables, and deploy. No custom domain, OAuth app,
or callback URLs needed.

## Usage

Sign in with the GitHub CLI or paste a token. In the top-right: the **switcher**
scopes to All / your personal account / a single org; the **sliders icon** opens
**Tracked checks** (name the required checks to see as "Awaiting"); the **sun/moon**
toggles the theme; **Sign Out** clears the stored token. Click a **PR title** (or a
suggested-action link) to jump to GitHub. Use **Flat / By repo / By check** to
group, **Hide drafts** to filter, and **Refresh** to re-fetch without reloading.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — conventions, tests, and CI setup
- [docs/DESIGN.md](docs/DESIGN.md) — design system
- [docs/UI-AUDIT.md](docs/UI-AUDIT.md) — UI/UX audit notes

Licensed under [MIT](LICENSE).
