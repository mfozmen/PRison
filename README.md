# PRison

[![CI](https://github.com/mfozmen/PRison/actions/workflows/ci.yml/badge.svg)](https://github.com/mfozmen/PRison/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=coverage)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)

A read-only GitHub dashboard that shows which pull requests need your attention,
and for how long they've been waiting:

- **Stuck on checks** — your open PRs whose checks are failing or pending, oldest first.
- **Waiting on your review** — PRs you're blocking, oldest first.

It's scoped to one organization at a time, and every row deep-links you straight
to GitHub to act.

## Getting started

### Prerequisites

- Node.js 20+
- A GitHub account

### 1. Create a GitHub OAuth App

Sign-in uses a GitHub OAuth App (free, about two minutes):

1. Open **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Homepage URL** to `http://localhost:3000`.
3. Set **Authorization callback URL** to `http://localhost:3000/api/auth/callback/github`.
4. Click **Register application**, then **Generate a new client secret**.
5. Keep the **Client ID** and **Client Secret** — you'll need them next.

> [!NOTE]
> Sign-in requests the `read:org repo` scopes. `repo` is required because GitHub
> OAuth has no read-only scope for private-repository PRs. The token is kept
> server-side (in the session JWT) and is never sent to the browser.

### 2. Run it locally

```sh
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Value |
| --- | --- |
| `AUTH_GITHUB_ID` | OAuth App Client ID |
| `AUTH_GITHUB_SECRET` | OAuth App Client Secret |
| `AUTH_SECRET` | a random secret — run `npx auth secret` |
| `AUTH_URL` | `http://localhost:3000` |

```sh
npm run dev
```

Open `http://localhost:3000` and sign in with GitHub.

## Deploying to Vercel

Deploy on the free [Vercel](https://vercel.com) tier — no custom domain or paid
plan needed. Do this **after** you have it running locally:

1. Import the repository on Vercel (it auto-detects Next.js) and deploy once to
   get your URL, e.g. `https://prison-yourname.vercel.app`.
2. In the Vercel project, add the same four environment variables, setting
   `AUTH_URL` to that deployment URL.
3. Back in your GitHub OAuth App, add a second **Authorization callback URL**:
   `https://prison-yourname.vercel.app/api/auth/callback/github`.
4. Redeploy.

## Usage

Sign in, then pick an organization from the switcher in the top-right (your
choice is remembered). The two lists update for that org; click **Open PR** or a
suggested-action link to jump to GitHub.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — conventions, tests, and CI setup
- [docs/DESIGN.md](docs/DESIGN.md) — design system
- [docs/UI-AUDIT.md](docs/UI-AUDIT.md) — UI/UX audit notes

Licensed under [MIT](LICENSE).
