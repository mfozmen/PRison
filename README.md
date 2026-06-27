# PRison

[![CI](https://github.com/mfozmen/PRison/actions/workflows/ci.yml/badge.svg)](https://github.com/mfozmen/PRison/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=coverage)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)

A read-only GitHub dashboard for one thing: seeing which pull requests need your
attention, and for how long they've been waiting.

- **Stuck on checks** — your open PRs whose checks are failing or pending, oldest first.
- **Waiting on your review** — PRs you're blocking, oldest first.

Scoped to one organization at a time. Read-only — each row deep-links you to GitHub to act.

## 1. Create a GitHub OAuth App

Sign-in uses a GitHub OAuth App (free, ~2 minutes):

1. **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. **Homepage URL:** `http://localhost:3000`
3. **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
4. **Register**, then **Generate a new client secret**. Keep the **Client ID** and **Client Secret**.

Scopes are requested at sign-in as `read:org repo`. `repo` is needed because GitHub
OAuth has no read-only scope for private-repo PRs; the token stays server-side (in the
JWT) and is never sent to the browser.

## 2. Configure and run

```sh
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Value |
|---|---|
| `AUTH_GITHUB_ID` | OAuth App Client ID |
| `AUTH_GITHUB_SECRET` | OAuth App Client Secret |
| `AUTH_SECRET` | run `npx auth secret` (or `openssl rand -base64 32`) |
| `AUTH_URL` | `http://localhost:3000` |

```sh
npm run dev   # http://localhost:3000, then sign in with GitHub
```

## 3. Deploy (Vercel)

Import the repo on the free [Vercel](https://vercel.com) tier, add the same four env
vars (set `AUTH_URL` to your Vercel URL), and deploy. Then add a second **callback URL**
to your OAuth App: `https://<your-app>.vercel.app/api/auth/callback/github`.

No custom domain or paid plan needed.

## Contributing

PRs welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for conventions, the test
commands, and the CI / SonarCloud / AI-review setup.

## License

[MIT](LICENSE) © 2026 Mehmet Fahri Özmen
