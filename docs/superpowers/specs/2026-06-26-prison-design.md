# PRison — Design Spec

> A focused dashboard for prioritizing GitHub pull-request work: the PRs of mine
> that are stuck on checks, and the PRs that are stuck waiting on my review.

- **Status:** Approved (design)
- **Date:** 2026-06-26
- **Repo:** `github.com/mfozmen/PRison`
- **License:** Open source (MIT)

---

## 1. Purpose

A single-page web app that answers two questions at a glance, so I can
prioritize my pull-request work:

1. **Which of my open PRs are stuck on checks, and for how long?**
2. **Which open PRs are waiting on my review, and how long have I been blocking
   others by not reviewing?**

Everything is scoped to **one selected organization at a time** (tenant-style
switcher in the top-right). Read-only — the only action is opening a PR on
GitHub.

## 2. Non-goals (v1)

- No write/mutating actions (no re-run checks, no approve/merge). The app may
  *suggest* an action and deep-link to the right GitHub tab, but never performs
  it — the user acts externally themselves.
- No "all organizations at once" aggregate view — one org at a time.
- No historical analytics, charts, or trend tracking.
- No notifications, email, or background polling.

## 3. Tech stack

| Concern        | Choice                                              |
| -------------- | --------------------------------------------------- |
| Framework      | Next.js (App Router) + TypeScript                   |
| Auth           | NextAuth (Auth.js) GitHub OAuth provider            |
| GitHub data    | GitHub GraphQL API via `@octokit/graphql`           |
| Styling        | Tailwind CSS + `ui-ux-pro-max` design system        |
| Testing        | Vitest + React Testing Library (TDD)                |
| Hosting        | Vercel (Hobby/free tier, `*.vercel.app` subdomain)  |
| Quality        | SonarCloud                                          |
| AI review      | Claude Code GitHub Action                           |

**Cost:** $0. No custom domain required.

All product text, code, comments, commits, and docs are in **English only**.

## 4. Architecture

```
Browser (Next.js client)
   │
   ├── NextAuth session (GitHub OAuth) ── stores access token server-side
   │
   └── /api/* route handlers (server)
          │  use the session's GitHub token
          └── GitHub GraphQL API
```

- **OAuth scopes:** `read:org`, `repo` (read access needed for private-repo PRs
  and check status). Minimal scopes; documented in README.
- GitHub token never reaches the browser. The client calls our own API routes;
  the server attaches the token and queries GitHub GraphQL.

### Components / modules (each independently testable)

1. **`lib/github/queries.ts`** — pure functions building GraphQL query strings
   and parsing responses into domain models. No network, no React. Fully
   unit-tested.
2. **`lib/github/client.ts`** — thin authenticated GraphQL client wrapper.
3. **`lib/prioritize.ts`** — pure sorting + age/urgency classification. Unit-tested.
4. **API routes** — `/api/stuck-prs?org=`, `/api/review-requests?org=`,
   `/api/orgs`. Orchestrate client + queries; return domain models.
5. **UI components** — `OrgSwitcher`, `PrList`, `PrRow`, `AgeBadge`,
   `SignInButton`. Presentational; tested with Testing Library.

## 5. Data model

```ts
type StuckPr = {
  id: string;
  title: string;
  url: string;
  repo: string;          // "owner/name"
  number: number;
  failingChecks: number;
  pendingChecks: number;
  stuckSince: string;    // ISO — HEAD commit pushedDate (when current checks began)
};

type ReviewRequest = {
  id: string;
  title: string;
  url: string;
  repo: string;
  number: number;
  author: string;
  requestedAt: string;   // ISO — when review was requested from me
};
```

## 6. GitHub GraphQL queries

- **Organizations:** `viewer.organizations(first: 100)` → login + avatar. Used to
  populate the tenant switcher.
- **My stuck PRs:** `search(query: "is:open is:pr author:@me org:<ORG>", type: ISSUE)`.
  For each PR, read `commits(last:1).commit.statusCheckRollup` and the contexts.
  - **Stuck** = at least one check is `FAILURE`/`ERROR` (failing) OR
    `PENDING`/`EXPECTED`/`IN_PROGRESS`/`QUEUED` (pending). PRs whose checks are all
    successful are excluded.
  - `stuckSince` = HEAD commit `pushedDate` (fallback `committedDate`).
- **Waiting on my review:**
  `search(query: "is:open is:pr review-requested:@me org:<ORG>", type: ISSUE)`.
  - `requestedAt` = timestamp of the `ReviewRequestedEvent` that targeted me,
    read from the PR `timelineItems`. Fallback: PR `updatedAt` if not resolvable.

## 7. Prioritization & display

- Both lists sorted by duration **descending** (longest-waiting first).
- **Age badge** per row, by elapsed time:
  - green `< 1 day`, yellow `1–3 days`, red `> 3 days`.
- Each row: title, repo `#number`, age badge, status detail
  (stuck list: "2 failing · 1 pending"; review list: author + "waiting Xd"),
  an **Open PR** button (links to `url`, opens GitHub), and a **suggested action
  hint** (read-only, advisory) that deep-links to the relevant GitHub tab:
  - failing checks → "Re-run failed checks" → `<url>/checks`
  - pending checks → "Investigate pending CI" → `<url>/checks`
  - review request → "Review to unblock <author>" → `<url>/files`
  The hint never triggers anything; the user performs the action externally.
- Empty states: "No PRs stuck on checks 🎉" / "No PRs waiting on your review 🎉".

## 8. Org switcher (tenant-style)

- Top-right dropdown listing the viewer's organizations (single-select).
- Selecting an org re-scopes both lists to that org's PRs only.
- Selection persisted in `localStorage`; restored on next visit.
- Default on first load: the first organization returned (or a prompt to pick one
  if the user belongs to none — then fall back to `user:@me` personal scope).

## 9. Error handling

- Not signed in → render `SignInButton` only.
- GitHub API error (rate limit, auth) → inline error banner per list with a
  retry button; the other list still renders independently.
- Token expired/revoked → force re-auth via NextAuth.
- Partial PR data (e.g. missing rollup) → treat as "pending" rather than crash.

## 10. Testing strategy (TDD)

- **Unit (pure):** query builders, response parsers, `prioritize` sorting and age
  classification — written test-first, no network.
- **Component:** `PrRow`/`AgeBadge`/`OrgSwitcher`/`PrList` rendering and empty/error
  states with mocked data.
- **API routes:** tested with a mocked GraphQL client (no live GitHub calls).
- No live-GitHub integration tests in CI (would need secrets + be flaky).

## 11. CI / quality / delivery

- **Branch + PR per increment.** No direct pushes to `main`.
- **Conventional Commits** for every commit.
- **GitHub Actions:**
  - CI: install, lint, typecheck, test (with coverage) on every PR.
  - SonarCloud scan (coverage uploaded from the test step).
  - Claude Code AI review action on PRs.
- **README** documents OAuth App setup, env vars, local dev, and Vercel deploy.
- **Living docs:** a `docs/` set kept updated with examples as the project grows
  (per the request to "feed the markdown files with examples continuously").

## 12. Environment variables

| Var                    | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `AUTH_GITHUB_ID`       | GitHub OAuth App client id               |
| `AUTH_GITHUB_SECRET`   | GitHub OAuth App client secret           |
| `AUTH_SECRET`          | NextAuth session encryption secret       |
| `AUTH_URL`             | Deployment URL (NextAuth callback base)  |

## 13. Open questions

None blocking. Future (post-v1) candidates, explicitly out of scope now:
quick actions (re-run checks, approve), multi-org aggregate, saved filters.
