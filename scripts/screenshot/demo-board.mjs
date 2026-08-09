#!/usr/bin/env node
// Synthetic board for docs/screenshot.png.
//
// PRison is a public repository, so nothing in a screenshot may name a real
// organization, repository, or person. These payloads are the /api/* responses
// the Dashboard fetches, in the domain shapes lib/types.ts defines, built from
// the same allowlisted names lib/generic-fixtures.ts enforces everywhere else.
//
// Ages are relative to the moment you run this, so the badges read "2h", "3d"
// and so on instead of freezing at whatever date the file was written.
//
//   node scripts/screenshot/demo-board.mjs        # the page snippet to run
//   node scripts/screenshot/demo-board.mjs --json # just the payloads
//
// See .claude/skills/refresh-screenshot for the whole procedure.

const now = Date.now();
const ago = (hours) => new Date(now - hours * 3_600_000).toISOString();

const stuck = [
  {
    id: "PR_s1", title: "Retry the payment webhook instead of dropping it",
    url: "https://github.com/acme/api/pull/482", repo: "acme/api", number: 482,
    failingChecks: 1, pendingChecks: 0, failing: ["integration-tests"], pending: [],
    checkNames: ["build", "lint", "integration-tests"],
    isDraft: false, blocked: true, readyViaBlocked: false,
    reviewDecision: "APPROVED", mergeState: "BLOCKED", stuckSince: ago(30),
  },
  {
    id: "PR_s2", title: "Cache the org lookup for the duration of a request",
    url: "https://github.com/globex/backend/pull/97", repo: "globex/backend", number: 97,
    failingChecks: 0, pendingChecks: 2, failing: [], pending: ["e2e", "deploy-preview"],
    checkNames: ["build", "e2e", "deploy-preview"],
    isDraft: false, blocked: false, readyViaBlocked: false,
    reviewDecision: "REVIEW_REQUIRED", mergeState: "", stuckSince: ago(5),
  },
  {
    id: "PR_s3", title: "Split the importer into a queue worker",
    url: "https://github.com/acme/api/pull/486", repo: "acme/api", number: 486,
    failingChecks: 0, pendingChecks: 0, failing: [], pending: [],
    checkNames: ["build"],
    isDraft: true, blocked: false, readyViaBlocked: false,
    reviewDecision: "", mergeState: "", stuckSince: ago(2),
  },
  {
    id: "PR_s4", title: "Fix the timezone drift in scheduled reports",
    url: "https://github.com/initech/worker/pull/13", repo: "initech/worker", number: 13,
    failingChecks: 2, pendingChecks: 0, failing: ["lint", "typecheck"], pending: [],
    checkNames: ["build", "lint", "typecheck"],
    isDraft: false, blocked: false, readyViaBlocked: false,
    reviewDecision: "CHANGES_REQUESTED", mergeState: "", stuckSince: ago(96),
  },
];

const reviews = [
  {
    id: "PR_r1", title: "Add rate limiting to the public search endpoint",
    url: "https://github.com/acme/api/pull/479", repo: "acme/api", number: 479,
    author: "alice", requestedAt: ago(50), isDraft: false,
  },
  {
    id: "PR_r2", title: "Move the CSV export off the request thread",
    url: "https://github.com/widgets-inc/frontend/pull/204", repo: "widgets-inc/frontend", number: 204,
    author: "bob", requestedAt: ago(7), isDraft: false,
  },
  {
    id: "PR_r3", title: "Spike: replace the polling loop with webhooks",
    url: "https://github.com/globex/backend/pull/101", repo: "globex/backend", number: 101,
    author: "carol", requestedAt: ago(1), isDraft: true,
  },
];

const ready = [
  {
    id: "PR_m1", title: "Document the deploy rollback steps",
    url: "https://github.com/acme/web/pull/58", repo: "acme/web", number: 58,
    readySince: ago(20), needsUpdate: false, checkNames: ["build"], viaBlocked: false,
  },
  {
    id: "PR_m2", title: "Bump the client library to 3.2",
    url: "https://github.com/initech/worker/pull/15", repo: "initech/worker", number: 15,
    readySince: ago(4), needsUpdate: true, checkNames: ["build", "lint"], viaBlocked: false,
  },
];

const comments = [
  {
    id: "RT_1", prId: "PR_s1",
    url: "https://github.com/acme/api/pull/482#discussion_r1",
    repo: "acme/api", number: 482, author: "dave", isBot: false,
    path: "src/webhooks/payment.ts", source: "thread",
    preview: "Does this retry on a 5xx only, or on any non-2xx? A 402 coming back twice would charge the customer twice.",
    commentedAt: ago(6), viewerReacted: false, viewerStarted: false,
  },
  {
    id: "RV_1", prId: "PR_m1",
    url: "https://github.com/acme/web/pull/58#pullrequestreview-1",
    repo: "acme/web", number: 58, author: "carol", isBot: false,
    path: "", source: "review",
    preview: "Approving, but the rollback section should say who is allowed to run it — that is the part people get wrong at 3am.",
    commentedAt: ago(3), viewerReacted: false, viewerStarted: false,
  },
  {
    id: "RT_2", prId: "PR_r2",
    url: "https://github.com/widgets-inc/frontend/pull/204#discussion_r2",
    repo: "widgets-inc/frontend", number: 204, author: "bob", isBot: false,
    path: "app/exports/csv.ts", source: "thread",
    preview: "Moved it to the worker as you suggested — the streaming version is in the second commit.",
    commentedAt: ago(2), viewerReacted: false, viewerStarted: true,
  },
];

const closed = [
  { id: "PR_c1", title: "Drop the legacy exporter", url: "https://github.com/acme/api/pull/470", repo: "acme/api", number: 470, merged: true, endedAt: ago(28) },
  { id: "PR_c2", title: "Try a shared cache for the report builder", url: "https://github.com/initech/worker/pull/11", repo: "initech/worker", number: 11, merged: false, endedAt: ago(52) },
  { id: "PR_c3", title: "Pin the CI runner image", url: "https://github.com/acme/web/pull/55", repo: "acme/web", number: 55, merged: true, endedAt: ago(76) },
];

const reviewed = [
  {
    id: "PR_v1", title: "Normalise the webhook signature check",
    url: "https://github.com/globex/backend/pull/94", repo: "globex/backend", number: 94,
    author: "alice", state: "CHANGES_REQUESTED", reviewedAt: ago(26), updatedSince: true, isDraft: false,
  },
  {
    id: "PR_v2", title: "Add a health endpoint to the worker",
    url: "https://github.com/widgets-inc/frontend/pull/198", repo: "widgets-inc/frontend", number: 198,
    author: "dave", state: "APPROVED", reviewedAt: ago(70), updatedSince: false, isDraft: false,
  },
];

// Keyed by the fragment of the route path that identifies it, longest first so
// "pr-comments" is never matched by a shorter sibling.
export const BOARD = {
  "review-requests": reviews,
  "ready-to-merge": ready,
  "reviewed-prs": reviewed,
  "pr-comments": comments,
  "closed-prs": closed,
  "stuck-prs": stuck,
};

// Run this in the page, then press Refresh: every list refetches and lands on
// the synthetic board. Deliberately a patch over window.fetch rather than a
// server-side stub — it needs nothing running but the dev server, and it cannot
// leave a bypass behind in shipped code.
export function pageSnippet() {
  return `(() => {
  const board = ${JSON.stringify(BOARD)};
  const real = window.fetch;
  window.fetch = (input, init) => {
    const url = String(input && input.url ? input.url : input);
    const hit = Object.keys(board).find((k) => url.includes("/api/" + k));
    if (!hit) return real(input, init);
    return Promise.resolve(new Response(JSON.stringify(board[hit]), {
      status: 200, headers: { "content-type": "application/json" },
    }));
  };
  return "patched: " + Object.keys(board).join(", ");
})()`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(process.argv.includes("--json") ? JSON.stringify(BOARD, null, 2) : pageSnippet());
}
