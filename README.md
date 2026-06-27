# PRison

[![CI](https://github.com/mfozmen/PRison/actions/workflows/ci.yml/badge.svg)](https://github.com/mfozmen/PRison/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=coverage)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)

A read-only GitHub dashboard that shows which pull requests need your attention,
and for how long they've been waiting:

- **Stuck on checks** — your open PRs whose checks are failing or pending, oldest first.
- **Waiting on your review** — PRs you're blocking, oldest first.

It spans every repo you can access — your personal account and all your
organizations — with an optional per-org filter. PRison uses **your own access
token**, so there's no third-party app to get approved, and every row deep-links
you to GitHub to act.

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

Open the app and click **Sign in with GitHub CLI** (recommended if `gh` is installed and signed in). The server reads your CLI token — nothing is stored in the browser.

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

Sign in with the GitHub CLI or paste a token, then use the filter in the
top-right to narrow to one organization (defaults to **All**). Click **Open PR**
or a suggested-action link to jump to GitHub. **Sign Out** clears the stored
token.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — conventions, tests, and CI setup
- [docs/DESIGN.md](docs/DESIGN.md) — design system
- [docs/UI-AUDIT.md](docs/UI-AUDIT.md) — UI/UX audit notes

Licensed under [MIT](LICENSE).
