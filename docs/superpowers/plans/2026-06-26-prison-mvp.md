# PRison MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Next.js dashboard that lists, for one selected GitHub org, the user's open PRs stuck on checks and the open PRs waiting on the user's review — each sorted by how long it has been stuck/waiting.

**Architecture:** Next.js App Router app. NextAuth (Auth.js) handles GitHub OAuth and keeps the access token server-side. Server-only API routes call the GitHub GraphQL API with that token and return plain domain objects. Pure functions (query parsers, prioritization) hold all the logic and are unit-tested without any network. React components are presentational and tested with Testing Library.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5, NextAuth v5 (`next-auth@beta`), `@octokit/graphql`, Tailwind CSS v4, Vitest 3 + `@testing-library/react` + jsdom.

## Global Constraints

- Node 20+.
- **English only** in all code, comments, identifiers, UI copy, commits, and docs. No Turkish anywhere in the repo.
- **Conventional Commits** for every commit (`feat:`, `test:`, `chore:`, `docs:`, `ci:`).
- **One PR per task.** No direct pushes to `main`. Branch name: `task-N-short-slug`.
- **TDD:** failing test first, minimal code to pass, then commit.
- **No secrets in the repo.** `.env*` is git-ignored; only env-var *names* appear in docs.
- GitHub OAuth scopes: `read:org`, `repo` (read). Nothing broader.
- Domain types are defined in Task 2 and reused verbatim everywhere.

---

### Task 1: Project scaffold + CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `.gitignore`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `lib/smoke.ts`, `lib/smoke.test.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable app, `npm run lint|typecheck|test`, and a green CI workflow other tasks rely on.

- [ ] **Step 1: Scaffold the app**

```bash
npx create-next-app@latest . --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*" --use-npm --yes
npm i next-auth@beta @octokit/graphql
npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 2: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    coverage: { provider: "v8", reporter: ["text", "lcov"], include: ["lib/**", "app/**"] },
  },
  resolve: { alias: { "@": __dirname } },
});
```

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:cov": "vitest run --coverage",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Write the failing smoke test**

Create `lib/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { appName } from "./smoke";

describe("appName", () => {
  it("returns PRison", () => {
    expect(appName()).toBe("PRison");
  });
});
```

- [ ] **Step 4: Run it, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./smoke`.

- [ ] **Step 5: Implement**

Create `lib/smoke.ts`:

```ts
export function appName(): string {
  return "PRison";
}
```

- [ ] **Step 6: Run it, verify it passes**

Run: `npm test` → PASS. Then `npm run typecheck` and `npm run lint` → no errors.

- [ ] **Step 7: Add CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:cov
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/lcov.info
```

- [ ] **Step 8: Commit & open PR**

```bash
git checkout -b task-1-scaffold
git add -A
git commit -m "chore: scaffold Next.js app with Vitest and CI"
git push -u origin task-1-scaffold
gh pr create --fill
```

---

### Task 2: Domain types + prioritization logic

**Files:**
- Create: `lib/types.ts`
- Create: `lib/prioritize.ts`, `lib/prioritize.test.ts`
- Create: `lib/suggest.ts`, `lib/suggest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types `StuckPr`, `ReviewRequest`, `Org` (used by every later task).
  - `ageBucket(sinceISO: string, now: Date): "fresh" | "warning" | "urgent"`
  - `sortByAgeAsc<T>(items: T[], key: (t: T) => string): T[]` — oldest timestamp first.
  - `Suggestion = { text: string; href: string }`
  - `suggestStuck(pr: StuckPr): Suggestion` — read-only advisory hint + GitHub deep link.
  - `suggestReview(req: ReviewRequest): Suggestion` — read-only advisory hint + deep link.

- [ ] **Step 1: Define types**

Create `lib/types.ts`:

```ts
export type Org = { login: string; avatarUrl: string };

export type StuckPr = {
  id: string;
  title: string;
  url: string;
  repo: string;
  number: number;
  failingChecks: number;
  pendingChecks: number;
  stuckSince: string; // ISO
};

export type ReviewRequest = {
  id: string;
  title: string;
  url: string;
  repo: string;
  number: number;
  author: string;
  requestedAt: string; // ISO
};

export type AgeBucket = "fresh" | "warning" | "urgent";
```

- [ ] **Step 2: Write failing tests**

Create `lib/prioritize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ageBucket, sortByAgeAsc } from "./prioritize";

const now = new Date("2026-06-26T12:00:00Z");

describe("ageBucket", () => {
  it("is fresh under 1 day", () => {
    expect(ageBucket("2026-06-26T00:00:00Z", now)).toBe("fresh");
  });
  it("is warning between 1 and 3 days", () => {
    expect(ageBucket("2026-06-24T12:00:00Z", now)).toBe("warning");
  });
  it("is urgent over 3 days", () => {
    expect(ageBucket("2026-06-20T00:00:00Z", now)).toBe("urgent");
  });
});

describe("sortByAgeAsc", () => {
  it("puts the oldest timestamp first", () => {
    const items = [{ t: "2026-06-25T00:00:00Z" }, { t: "2026-06-20T00:00:00Z" }];
    const sorted = sortByAgeAsc(items, (i) => i.t);
    expect(sorted.map((i) => i.t)).toEqual([
      "2026-06-20T00:00:00Z",
      "2026-06-25T00:00:00Z",
    ]);
  });
  it("does not mutate input", () => {
    const items = [{ t: "2026-06-25T00:00:00Z" }, { t: "2026-06-20T00:00:00Z" }];
    sortByAgeAsc(items, (i) => i.t);
    expect(items[0].t).toBe("2026-06-25T00:00:00Z");
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `npm test lib/prioritize.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement**

Create `lib/prioritize.ts`:

```ts
import type { AgeBucket } from "./types";

const DAY_MS = 86_400_000;

export function ageBucket(sinceISO: string, now: Date): AgeBucket {
  const days = (now.getTime() - new Date(sinceISO).getTime()) / DAY_MS;
  if (days < 1) return "fresh";
  if (days <= 3) return "warning";
  return "urgent";
}

export function sortByAgeAsc<T>(items: T[], key: (t: T) => string): T[] {
  return [...items].sort(
    (a, b) => new Date(key(a)).getTime() - new Date(key(b)).getTime(),
  );
}
```

- [ ] **Step 5: Run, verify it passes**

Run: `npm test lib/prioritize.test.ts` → PASS.

- [ ] **Step 6: Write failing suggestion tests**

Create `lib/suggest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { suggestStuck, suggestReview } from "./suggest";
import type { StuckPr, ReviewRequest } from "./types";

const base = { id: "1", title: "t", url: "https://github.com/acme/b/pull/2", number: 2, repo: "acme/b" };

describe("suggestStuck", () => {
  it("suggests re-running checks when failing", () => {
    const pr: StuckPr = { ...base, failingChecks: 2, pendingChecks: 0, stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "Re-run failed checks",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
  it("suggests investigating CI when only pending", () => {
    const pr: StuckPr = { ...base, failingChecks: 0, pendingChecks: 1, stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "Investigate pending CI",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
});

describe("suggestReview", () => {
  it("suggests reviewing to unblock the author", () => {
    const req: ReviewRequest = { ...base, author: "alice", requestedAt: "x" };
    expect(suggestReview(req)).toEqual({
      text: "Review to unblock alice",
      href: "https://github.com/acme/b/pull/2/files",
    });
  });
});
```

- [ ] **Step 7: Run, verify it fails**

Run: `npm test lib/suggest.test.ts` → FAIL (module not found).

- [ ] **Step 8: Implement**

Create `lib/suggest.ts`:

```ts
import type { StuckPr, ReviewRequest } from "./types";

export type Suggestion = { text: string; href: string };

export function suggestStuck(pr: StuckPr): Suggestion {
  const text = pr.failingChecks > 0 ? "Re-run failed checks" : "Investigate pending CI";
  return { text, href: `${pr.url}/checks` };
}

export function suggestReview(req: ReviewRequest): Suggestion {
  return { text: `Review to unblock ${req.author}`, href: `${req.url}/files` };
}
```

- [ ] **Step 9: Run, verify it passes**

Run: `npm test lib/suggest.test.ts` → PASS.

- [ ] **Step 10: Commit & PR**

```bash
git checkout -b task-2-prioritize
git add lib/types.ts lib/prioritize.ts lib/prioritize.test.ts lib/suggest.ts lib/suggest.test.ts
git commit -m "feat: add domain types, prioritization, and action suggestions"
git push -u origin task-2-prioritize && gh pr create --fill
```

---

### Task 3: GraphQL query strings + response parsers

**Files:**
- Create: `lib/github/queries.ts`, `lib/github/queries.test.ts`
- Create: `lib/github/fixtures.ts` (sample GraphQL responses for tests)

**Interfaces:**
- Consumes: types from Task 2.
- Produces:
  - `ORGS_QUERY`, `STUCK_PRS_QUERY`, `REVIEW_REQUESTS_QUERY` (string constants).
  - `searchQuery(kind: "author" | "review", org: string): string`
  - `parseOrgs(raw): Org[]`
  - `parseStuckPrs(raw): StuckPr[]` — keeps only PRs with ≥1 failing or pending check.
  - `parseReviewRequests(raw, viewerLogin: string): ReviewRequest[]`

- [ ] **Step 1: Write fixtures**

Create `lib/github/fixtures.ts` with two PRs (one all-green → excluded, one with 2 failing + 1 pending → included) and one review-request PR. Shape mirrors the GraphQL responses described in Steps 4–5. (Full literal objects; no placeholders — copy the structures from the parser tests below.)

- [ ] **Step 2: Write failing tests**

Create `lib/github/queries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { searchQuery, parseStuckPrs, parseReviewRequests, parseOrgs } from "./queries";

describe("searchQuery", () => {
  it("scopes author search to the org", () => {
    expect(searchQuery("author", "acme")).toBe("is:open is:pr author:@me org:acme");
  });
  it("scopes review search to the org", () => {
    expect(searchQuery("review", "acme")).toBe("is:open is:pr review-requested:@me org:acme");
  });
});

describe("parseStuckPrs", () => {
  const raw = {
    search: { nodes: [
      { __typename: "PullRequest", id: "1", title: "green", url: "u1", number: 1,
        repository: { nameWithOwner: "acme/a" },
        commits: { nodes: [{ commit: { pushedDate: "2026-06-25T00:00:00Z",
          statusCheckRollup: { contexts: { nodes: [{ conclusion: "SUCCESS" }] } } } }] } },
      { __typename: "PullRequest", id: "2", title: "stuck", url: "u2", number: 2,
        repository: { nameWithOwner: "acme/b" },
        commits: { nodes: [{ commit: { pushedDate: "2026-06-20T00:00:00Z",
          statusCheckRollup: { contexts: { nodes: [
            { conclusion: "FAILURE" }, { conclusion: "FAILURE" }, { status: "IN_PROGRESS" },
          ] } } } }] } },
    ] },
  };
  it("keeps only PRs with failing or pending checks", () => {
    const prs = parseStuckPrs(raw);
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      id: "2", title: "stuck", url: "u2", repo: "acme/b", number: 2,
      failingChecks: 2, pendingChecks: 1, stuckSince: "2026-06-20T00:00:00Z",
    });
  });
});

describe("parseReviewRequests", () => {
  const raw = {
    search: { nodes: [
      { id: "9", title: "needs me", url: "u9", number: 9,
        repository: { nameWithOwner: "acme/c" },
        author: { login: "alice" },
        timelineItems: { nodes: [
          { requestedReviewer: { login: "me" }, createdAt: "2026-06-22T00:00:00Z" },
          { requestedReviewer: { login: "bob" }, createdAt: "2026-06-23T00:00:00Z" },
        ] } },
    ] },
  };
  it("uses the createdAt of my review request", () => {
    const reqs = parseReviewRequests(raw, "me");
    expect(reqs[0]).toMatchObject({
      id: "9", author: "alice", repo: "acme/c", requestedAt: "2026-06-22T00:00:00Z",
    });
  });
});

describe("parseOrgs", () => {
  it("maps login and avatar", () => {
    const raw = { viewer: { organizations: { nodes: [{ login: "acme", avatarUrl: "a" }] } } };
    expect(parseOrgs(raw)).toEqual([{ login: "acme", avatarUrl: "a" }]);
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `npm test lib/github/queries.test.ts` → FAIL.

- [ ] **Step 4: Implement query strings**

Create `lib/github/queries.ts` (query constants + helpers):

```ts
import type { Org, StuckPr, ReviewRequest } from "@/lib/types";

export function searchQuery(kind: "author" | "review", org: string): string {
  const who = kind === "author" ? "author:@me" : "review-requested:@me";
  return `is:open is:pr ${who} org:${org}`;
}

export const ORGS_QUERY = `
  query { viewer { organizations(first: 100) { nodes { login avatarUrl } } } }`;

export const STUCK_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number
        repository { nameWithOwner }
        commits(last: 1) { nodes { commit {
          pushedDate committedDate
          statusCheckRollup { contexts(first: 100) { nodes {
            ... on CheckRun { status conclusion }
            ... on StatusContext { state }
          } } }
        } } }
      } }
    }
  }`;

export const REVIEW_REQUESTS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number updatedAt
        repository { nameWithOwner }
        author { login }
        timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], first: 100) {
          nodes { ... on ReviewRequestedEvent {
            createdAt requestedReviewer { ... on User { login } }
          } }
        }
      } }
    }
  }`;
```

- [ ] **Step 5: Implement parsers (same file)**

Append to `lib/github/queries.ts`:

```ts
const FAILING = new Set(["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED"]);
const PENDING = new Set(["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS"]);

function classify(ctx: { status?: string; conclusion?: string; state?: string }) {
  const v = ctx.conclusion ?? ctx.status ?? ctx.state ?? "";
  if (FAILING.has(v)) return "failing";
  if (PENDING.has(v)) return "pending";
  return "ok";
}

export function parseStuckPrs(raw: any): StuckPr[] {
  return (raw?.search?.nodes ?? [])
    .filter((n: any) => n?.id)
    .map((n: any) => {
      const commit = n.commits?.nodes?.[0]?.commit ?? {};
      const ctxs = commit.statusCheckRollup?.contexts?.nodes ?? [];
      let failingChecks = 0;
      let pendingChecks = 0;
      for (const c of ctxs) {
        const k = classify(c);
        if (k === "failing") failingChecks++;
        else if (k === "pending") pendingChecks++;
      }
      return {
        id: n.id, title: n.title, url: n.url, number: n.number,
        repo: n.repository.nameWithOwner,
        failingChecks, pendingChecks,
        stuckSince: commit.pushedDate ?? commit.committedDate ?? "",
      } as StuckPr;
    })
    .filter((p: StuckPr) => p.failingChecks > 0 || p.pendingChecks > 0);
}

export function parseReviewRequests(raw: any, viewerLogin: string): ReviewRequest[] {
  return (raw?.search?.nodes ?? [])
    .filter((n: any) => n?.id)
    .map((n: any) => {
      const mine = (n.timelineItems?.nodes ?? []).find(
        (e: any) => e?.requestedReviewer?.login === viewerLogin,
      );
      return {
        id: n.id, title: n.title, url: n.url, number: n.number,
        repo: n.repository.nameWithOwner,
        author: n.author?.login ?? "unknown",
        requestedAt: mine?.createdAt ?? n.updatedAt ?? "",
      } as ReviewRequest;
    });
}

export function parseOrgs(raw: any): Org[] {
  return (raw?.viewer?.organizations?.nodes ?? []).map((o: any) => ({
    login: o.login, avatarUrl: o.avatarUrl,
  }));
}
```

- [ ] **Step 6: Run, verify it passes**

Run: `npm test lib/github/queries.test.ts` → PASS.

- [ ] **Step 7: Commit & PR**

```bash
git checkout -b task-3-graphql-parsers
git add lib/github
git commit -m "feat: add GitHub GraphQL queries and response parsers"
git push -u origin task-3-graphql-parsers && gh pr create --fill
```

---

### Task 4: GitHub OAuth via NextAuth

**Files:**
- Create: `auth.ts`, `app/api/auth/[...nextauth]/route.ts`
- Create: `components/SignInButton.tsx`, `components/SignInButton.test.tsx`
- Create: `.env.example`
- Modify: `app/page.tsx` (show sign-in when unauthenticated)

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: `auth()` server helper, a session carrying `accessToken` and `login`, and `<SignInButton />`.

- [ ] **Step 1: Configure NextAuth**

Create `auth.ts`:

```ts
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: { params: { scope: "read:org repo" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) token.accessToken = account.access_token;
      if (profile) token.login = (profile as { login?: string }).login;
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.login = token.login as string;
      return session;
    },
  },
});
```

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

Create `.env.example`:

```
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_SECRET=
AUTH_URL=http://localhost:3000
```

Add a `types/next-auth.d.ts` module augmentation declaring `accessToken` and `login` on `Session` and JWT.

- [ ] **Step 2: Write failing component test**

Create `components/SignInButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignInButton } from "./SignInButton";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

describe("SignInButton", () => {
  it("renders a GitHub sign-in button", () => {
    render(<SignInButton />);
    expect(screen.getByRole("button", { name: /sign in with github/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `npm test components/SignInButton.test.tsx` → FAIL.

- [ ] **Step 4: Implement**

Create `components/SignInButton.tsx`:

```tsx
"use client";
import { signIn } from "next-auth/react";

export function SignInButton() {
  return (
    <button onClick={() => signIn("github")} className="rounded bg-black px-4 py-2 text-white">
      Sign in with GitHub
    </button>
  );
}
```

- [ ] **Step 5: Run, verify it passes**

Run: `npm test components/SignInButton.test.tsx` → PASS. `npm run typecheck` → clean.

- [ ] **Step 6: Commit & PR**

```bash
git checkout -b task-4-auth
git add auth.ts app/api components/SignInButton.* .env.example types
git commit -m "feat: add GitHub OAuth login via NextAuth"
git push -u origin task-4-auth && gh pr create --fill
```

---

### Task 5: GraphQL client + API routes

**Files:**
- Create: `lib/github/client.ts`
- Create: `app/api/orgs/route.ts`, `app/api/stuck-prs/route.ts`, `app/api/review-requests/route.ts`
- Create: `app/api/stuck-prs/route.test.ts` (route logic tested with a mocked client)

**Interfaces:**
- Consumes: queries/parsers (Task 3), `auth()` + session (Task 4).
- Produces: `GET /api/orgs` → `Org[]`; `GET /api/stuck-prs?org=` → `StuckPr[]`; `GET /api/review-requests?org=` → `ReviewRequest[]`. All return `401` when unauthenticated, `400` when `org` missing.

- [ ] **Step 1: Implement the client**

Create `lib/github/client.ts`:

```ts
import { graphql } from "@octokit/graphql";

export function ghClient(token: string) {
  return graphql.defaults({ headers: { authorization: `token ${token}` } });
}
```

- [ ] **Step 2: Write failing route test**

Create `app/api/stuck-prs/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const queryMock = vi.fn();
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/github/client", () => ({ ghClient: () => queryMock }));

import { GET } from "./route";

function req(url: string) {
  return new Request(url);
}

beforeEach(() => { authMock.mockReset(); queryMock.mockReset(); });

describe("GET /api/stuck-prs", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(req("http://x/api/stuck-prs?org=acme"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org is missing", async () => {
    authMock.mockResolvedValue({ accessToken: "t", login: "me" });
    const res = await GET(req("http://x/api/stuck-prs"));
    expect(res.status).toBe(400);
  });

  it("returns parsed stuck PRs", async () => {
    authMock.mockResolvedValue({ accessToken: "t", login: "me" });
    queryMock.mockResolvedValue({
      search: { nodes: [
        { id: "2", title: "stuck", url: "u2", number: 2,
          repository: { nameWithOwner: "acme/b" },
          commits: { nodes: [{ commit: { pushedDate: "2026-06-20T00:00:00Z",
            statusCheckRollup: { contexts: { nodes: [{ conclusion: "FAILURE" }] } } } }] } },
      ] },
    });
    const res = await GET(req("http://x/api/stuck-prs?org=acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].failingChecks).toBe(1);
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `npm test app/api/stuck-prs/route.test.ts` → FAIL.

- [ ] **Step 4: Implement the three routes**

Create `app/api/stuck-prs/route.ts`:

```ts
import { auth } from "@/auth";
import { ghClient } from "@/lib/github/client";
import { STUCK_PRS_QUERY, searchQuery, parseStuckPrs } from "@/lib/github/queries";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.accessToken) return new Response("Unauthorized", { status: 401 });
  const org = new URL(request.url).searchParams.get("org");
  if (!org) return new Response("org required", { status: 400 });
  const raw = await ghClient(session.accessToken)(STUCK_PRS_QUERY, {
    q: searchQuery("author", org),
  });
  return Response.json(parseStuckPrs(raw));
}
```

Create `app/api/review-requests/route.ts` (same shape, using `REVIEW_REQUESTS_QUERY`, `searchQuery("review", org)`, and `parseReviewRequests(raw, session.login)`).

Create `app/api/orgs/route.ts` (401 guard, then `ORGS_QUERY`, return `parseOrgs(raw)`; no `org` param).

- [ ] **Step 5: Run, verify it passes**

Run: `npm test app/api/stuck-prs/route.test.ts` → PASS.

- [ ] **Step 6: Commit & PR**

```bash
git checkout -b task-5-api-routes
git add lib/github/client.ts app/api/orgs app/api/stuck-prs app/api/review-requests
git commit -m "feat: add GitHub GraphQL client and PR data API routes"
git push -u origin task-5-api-routes && gh pr create --fill
```

---

### Task 6: Presentational components

**Files:**
- Create: `components/AgeBadge.tsx` + test
- Create: `components/PrRow.tsx` + test
- Create: `components/PrList.tsx` + test
- Create: `components/OrgSwitcher.tsx` + test
- Run the `ui-ux-pro-max` design-system skill to source palette/typography/spacing before styling.

**Interfaces:**
- Consumes: types (Task 2), `ageBucket` (Task 2).
- Produces:
  - `<AgeBadge since={iso} now={Date} />` → colored label.
  - `<PrRow>` for a stuck PR and for a review request (two small variants or one with a `detail` slot).
  - `<PrList title items emptyMessage renderRow />`.
  - `<OrgSwitcher orgs value onChange />`.

- [ ] **Step 1: Install the design-system skill**

```bash
npx ui-ux-pro-max-cli init --ai claude
```

Use its recommendations (palette, font pairing, spacing) when writing the Tailwind classes below. Keep all copy English.

- [ ] **Step 2: Write failing AgeBadge test**

Create `components/AgeBadge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgeBadge } from "./AgeBadge";

const now = new Date("2026-06-26T12:00:00Z");

describe("AgeBadge", () => {
  it("shows urgent styling for old items", () => {
    render(<AgeBadge since="2026-06-20T00:00:00Z" now={now} />);
    const badge = screen.getByText(/6d/i);
    expect(badge).toHaveAttribute("data-bucket", "urgent");
  });
  it("shows fresh styling for recent items", () => {
    render(<AgeBadge since="2026-06-26T06:00:00Z" now={now} />);
    expect(screen.getByText(/6h/i)).toHaveAttribute("data-bucket", "fresh");
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `npm test components/AgeBadge.test.tsx` → FAIL.

- [ ] **Step 4: Implement AgeBadge**

Create `components/AgeBadge.tsx`:

```tsx
import { ageBucket } from "@/lib/prioritize";

const COLORS = {
  fresh: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  urgent: "bg-red-100 text-red-800",
} as const;

function label(since: string, now: Date): string {
  const h = Math.floor((now.getTime() - new Date(since).getTime()) / 3_600_000);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export function AgeBadge({ since, now }: { since: string; now: Date }) {
  const bucket = ageBucket(since, now);
  return (
    <span data-bucket={bucket} className={`rounded px-2 py-0.5 text-xs ${COLORS[bucket]}`}>
      {label(since, now)}
    </span>
  );
}
```

- [ ] **Step 5: Run, verify it passes**

Run: `npm test components/AgeBadge.test.tsx` → PASS.

- [ ] **Step 6: Repeat the TDD cycle for PrRow, PrList, OrgSwitcher**

For each: write the failing test first (assert the title/url/Open-PR link for `PrRow`; the empty message and row count for `PrList`; the option list and `onChange` call for `OrgSwitcher`), run it red, implement the minimal component, run it green. Each component:

- `PrRow`: renders title, `repo #number`, an `<AgeBadge>`, a `detail` node, an `Open PR` link (`<a href={url} target="_blank">`), and a `suggestion` hint rendered as a secondary link (`<a href={suggestion.href} target="_blank">{suggestion.text}</a>`) styled to read as advice, not a button. Test asserts the hint text and href appear.
- `PrList`: renders `title`, the `emptyMessage` when `items` is empty, else maps `items` through `renderRow`.
- `OrgSwitcher`: a `<select>` of org logins; calls `onChange(login)` on change.

- [ ] **Step 7: Commit & PR**

```bash
git checkout -b task-6-components
git add components/ .claude/
git commit -m "feat: add presentational PR list and org switcher components"
git push -u origin task-6-components && gh pr create --fill
```

---

### Task 7: Dashboard page wiring

**Files:**
- Modify: `app/page.tsx` (server component: auth gate)
- Create: `components/Dashboard.tsx` + test (client: org selection, data fetching, persistence)
- Create: `components/Header.tsx` (org switcher + avatar/sign-out, top-right)

**Interfaces:**
- Consumes: API routes (Task 5), components (Task 6), types (Task 2).
- Produces: the working single-page dashboard. Selected org persisted in `localStorage` under key `prison.org`.

- [ ] **Step 1: Write failing Dashboard test**

Create `components/Dashboard.test.tsx`. Mock `global.fetch` to return one stuck PR and one review request for `?org=acme`; render `<Dashboard orgs={[{login:"acme",avatarUrl:"a"}]} />`; assert both PR titles appear, and that selecting an org writes `localStorage.getItem("prison.org")`.

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Dashboard } from "./Dashboard";

beforeEach(() => {
  localStorage.clear();
  global.fetch = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          url.includes("stuck")
            ? [{ id: "2", title: "stuck pr", url: "u", repo: "acme/b", number: 2, failingChecks: 1, pendingChecks: 0, stuckSince: "2026-06-20T00:00:00Z" }]
            : [{ id: "9", title: "review pr", url: "u", repo: "acme/c", number: 9, author: "alice", requestedAt: "2026-06-22T00:00:00Z" }],
        ),
    }),
  ) as unknown as typeof fetch;
});

describe("Dashboard", () => {
  it("renders both lists for the selected org", async () => {
    render(<Dashboard orgs={[{ login: "acme", avatarUrl: "a" }]} />);
    await waitFor(() => expect(screen.getByText("stuck pr")).toBeInTheDocument());
    expect(screen.getByText("review pr")).toBeInTheDocument();
    expect(localStorage.getItem("prison.org")).toBe("acme");
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test components/Dashboard.test.tsx` → FAIL.

- [ ] **Step 3: Implement Dashboard**

Client component: `useState` for selected org (init from `localStorage.getItem("prison.org")` else `orgs[0].login`), `useEffect` to persist on change and to fetch both endpoints, sort with `sortByAgeAsc`, render two `<PrList>`s with `<Header>`. Each `renderRow` passes `suggestion={suggestStuck(pr)}` (stuck list) or `suggestion={suggestReview(req)}` (review list) into `<PrRow>`. Show a per-list error banner if a fetch fails.

- [ ] **Step 4: Run, verify it passes**

Run: `npm test components/Dashboard.test.tsx` → PASS.

- [ ] **Step 5: Wire the page**

`app/page.tsx` (server): `const session = await auth();` — if no session render `<SignInButton />`; else fetch orgs server-side via `/api/orgs` (or call `parseOrgs` directly through the client) and render `<Dashboard orgs={orgs} />` wrapped in a `SessionProvider`.

- [ ] **Step 6: Manual smoke + commit & PR**

Run `npm run dev`, sign in, confirm both lists and the org switcher work. Then:

```bash
git checkout -b task-7-dashboard
git add app/page.tsx components/Dashboard.* components/Header.tsx
git commit -m "feat: wire dashboard page with org switcher and data fetching"
git push -u origin task-7-dashboard && gh pr create --fill
```

---

### Task 8: SonarCloud, Claude AI review, deploy docs

**Files:**
- Create: `.github/workflows/sonarcloud.yml`
- Create: `.github/workflows/claude-review.yml`
- Create: `sonar-project.properties`
- Modify: `README.md` (OAuth App setup, env vars, local dev, Vercel deploy, contributing)
- Create: `LICENSE` (MIT)

**Interfaces:**
- Consumes: the CI test/coverage output (Task 1).
- Produces: SonarCloud analysis on PRs, Claude AI review on PRs, and complete setup docs.

- [ ] **Step 1: SonarCloud config**

Create `sonar-project.properties`:

```
sonar.projectKey=mfozmen_PRison
sonar.organization=mfozmen
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.sources=app,lib,components
sonar.tests=.
sonar.test.inclusions=**/*.test.ts,**/*.test.tsx
```

Create `.github/workflows/sonarcloud.yml`: checkout, setup-node, `npm ci`, `npm run test:cov`, then `SonarSource/sonarcloud-github-action@v3` with `SONAR_TOKEN` secret. Note in README: connect the repo at sonarcloud.io and add `SONAR_TOKEN` repo secret.

- [ ] **Step 2: Claude AI review workflow**

Create `.github/workflows/claude-review.yml` using `anthropics/claude-code-action` triggered on `pull_request`, with `ANTHROPIC_API_KEY` secret. Document the required secret in README.

- [ ] **Step 3: README + LICENSE**

Write README sections: what it is, screenshot placeholder, **GitHub OAuth App setup** (callback `https://<app>.vercel.app/api/auth/callback/github` and `http://localhost:3000/api/auth/callback/github`), **env vars** (names from `.env.example`, values never committed), **local dev** (`npm i`, copy `.env.example` → `.env.local`, `npm run dev`), **Vercel deploy** (import repo, set the 4 env vars, deploy), **testing**, **contributing** (conventional commits, PR-per-change, English-only). Add MIT `LICENSE`.

- [ ] **Step 4: Commit & PR**

```bash
git checkout -b task-8-ci-docs
git add .github sonar-project.properties README.md LICENSE
git commit -m "ci: add SonarCloud and Claude AI review; docs: setup and deploy guide"
git push -u origin task-8-ci-docs && gh pr create --fill
```

---

## Self-Review

**Spec coverage:** §1 purpose → Tasks 6–7. §3 stack → Task 1. §4 architecture/scopes → Tasks 4–5. §5 data model → Task 2. §6 queries → Task 3. §7 prioritization/display → Tasks 2, 6, 7. §8 org switcher + localStorage → Tasks 6–7. §9 error handling → Tasks 5 (401/400) + 7 (banners). §10 testing → every task (TDD). §11 CI/Sonar/Claude/docs → Tasks 1, 8. §12 env vars → Task 4 (`.env.example`) + Task 8 (README). All covered.

**Placeholder scan:** Task 3 Step 1 (fixtures) and the repeated component cycle in Task 6 Step 6 reference structures shown in adjacent code blocks rather than re-printing them — acceptable since the exact shapes appear in the same task's tests. No `TODO`/`TBD` left in code steps.

**Type consistency:** `StuckPr`/`ReviewRequest`/`Org` (Task 2) used identically in Tasks 3, 5, 6, 7. `ageBucket`/`sortByAgeAsc` signatures consistent across Tasks 2, 6, 7. `session.accessToken`/`session.login` defined in Task 4, consumed in Task 5. `searchQuery("author"|"review", org)` consistent in Tasks 3 and 5.

---

## Post-MVP follow-ups

The MVP (Tasks 1–8) is complete and merged. These items were surfaced by
per-task reviews, the AI code review, and the ui-ux-pro-max UI audit
(`docs/UI-AUDIT.md`). None block the MVP; each can be its own PR.

### Product / correctness
- **`repo` OAuth scope is broad.** OAuth classic has no read-only scope for
  private-repo PRs, so `repo` is required for private repos. Offer a
  `public_repo`-only mode for users who only need public PRs.
- **"Stuck" check states.** `classify()` counts FAILURE/ERROR/TIMED_OUT/CANCELLED
  as failing. Consider treating `ACTION_REQUIRED` (and STARTUP_FAILURE/STALE) as
  stuck too — `ACTION_REQUIRED` genuinely needs the author's attention.
- **Pagination.** GraphQL queries cap at `first: 50` (search) / `first: 100`
  (contexts) with no cursor — large orgs silently truncate. Add cursor paging or
  surface a "showing first N" notice.
- **`ageBucket` on malformed ISO** returns "urgent" (NaN falls through). Add a
  guard if inputs ever come from outside the GitHub API.

### Robustness / observability
- **API route error logging.** The routes map GitHub errors to 502 but the catch
  blocks log nothing server-side; add structured logging for diagnosis.
- **Org-fetch failure** in `app/page.tsx` surfaces a banner but isn't logged.
- **React `act()` warning** in `Dashboard.test.tsx` (async transition state
  updates) — harmless but should be silenced for pristine test output.

### UI / UX (from `docs/UI-AUDIT.md`)
- **Light-mode variant** — design system supports light + dark; only dark ships.
- **SVG icons** — replace the empty-state emoji and add icons (Lucide/Phosphor)
  to "Open PR" / suggestion links.
- **Skeleton loading** for fetches > ~1s (currently a pulse dot).
- **OrgSwitcher visible label** when placed in a form context.
- **Responsive pass** at 375 / 768 / 1024 / 1440.
