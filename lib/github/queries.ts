/* eslint-disable @typescript-eslint/no-explicit-any */
// Raw GraphQL responses are intentionally untyped at the boundary; parsers
// convert them to domain types as the first step.
import type { Org, StuckPr, ReviewRequest, ReadyPr, PrComment, ClosedPr, ReviewedPr } from "@/lib/types";

// scope is optional: when omitted, the search spans every repo the token can
// see (the user's personal account plus all accessible organizations).
// Callers pass a ready-made qualifier string such as "org:acme" or "user:mfozmen".
export type SearchKind = "author" | "review" | "ready" | "closed" | "reviewed";

// Whose PRs each list is about.
//
// "ready" fetches all of the user's open PRs; parseReadyPrs then keeps the ones
// GitHub reports as mergeable now (mergeStateStatus CLEAN, not draft). We do NOT
// filter on review:approved here — a CLEAN PR is already mergeable (including
// any required review), and some repos don't require review.
//
// "reviewed" is the other side of "review": PRs the viewer has already submitted
// a review on, which review-requested:@me no longer returns. It excludes
// -author:@me because GitHub accepts a COMMENTED review on your own PR (inline
// self-annotations submit as one) and reviewed-by:@me returns it — and your own
// PR is already in the work queues, so it is not history to look back at.
const OWN_PRS = "author:@me";
const WHO: Record<SearchKind, string> = {
  author: OWN_PRS,
  ready: OWN_PRS,
  closed: OWN_PRS,
  review: "review-requested:@me",
  reviewed: "reviewed-by:@me -author:@me",
};

export function searchQuery(kind: SearchKind, scope?: string): string {
  const scopePart = scope ? ` ${scope}` : "";
  const who = WHO[kind];
  // "closed" fetches the user's finished PRs (merged is a subset of closed).
  const state = kind === "closed" ? "is:closed" : "is:open";
  // GitHub search has no merge-order sort; sort:updated-desc just biases the
  // fixed 50-row window toward recent activity. parseClosedPrs' consumer
  // re-sorts by endedAt client-side for true newest-close-first order.
  //
  // "reviewed" needs it for a different reason: unlike the other open-PR
  // searches it is not bounded by the viewer's own PR count, so a heavy
  // reviewer overflows 50 rows and the default relevance order would hand back
  // an arbitrary subset — dropping exactly the recent threads this exists for.
  const sort = kind === "closed" || kind === "reviewed" ? " sort:updated-desc" : "";
  return `${state} is:pr ${who}${scopePart}${sort}`;
}

/** Free to ask, and the only way anyone finds out what a refresh costs: the
 * allowance is hourly and account-wide, so "why did everything fail at once"
 * has a number behind it rather than a guess. */
export const RATE_LIMIT = `rateLimit { cost remaining resetAt }`;

export const VIEWER_QUERY = `query { viewer { login } }`;

export const ORGS_QUERY = `
  query { viewer { organizations(first: 100) { nodes { login avatarUrl } } } }`;

// Shared by both queries that read checks, because they have to agree on these
// fields and two copies is how they stop agreeing. completedAt and the workflow
// name are what tell a re-run apart from a second check that shares a name —
// see groupStatus. Neither is a connection, so they cost no query points.
const CHECK_ROLLUP = `statusCheckRollup { state contexts(first: 100) { nodes {
            ... on CheckRun {
              name status conclusion completedAt
              checkSuite { workflowRun { workflow { name } } }
            }
            ... on StatusContext { context state }
          } } }`;

export const STUCK_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft mergeStateStatus reviewDecision
        repository { nameWithOwner }
        # One entry per reviewer, their most recent review of any kind — which
        # is what the PR page's own reviewer list shows, and what reviewDecision
        # ignores. See supersededDecision.
        latestReviews(first: 20) { nodes { state } }
        commits(last: 1) { nodes { commit {
          pushedDate committedDate
          ${CHECK_ROLLUP}
        } } }
      } }
    }
      ${RATE_LIMIT}
  }`;

export const REVIEW_REQUESTS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft updatedAt
        repository { nameWithOwner }
        author { login }
        timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], first: 100) {
          nodes { ... on ReviewRequestedEvent {
            createdAt requestedReviewer { ... on User { login } }
          } }
        }
      } }
    }
      ${RATE_LIMIT}
  }`;

const FAILING = new Set(["FAILURE", "ERROR", "TIMED_OUT"]);
const PENDING = new Set(["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS"]);

function classify(ctx: { status?: string; conclusion?: string; state?: string }) {
  const v = ctx.conclusion ?? ctx.status ?? ctx.state ?? "";
  if (FAILING.has(v)) return "failing";
  if (PENDING.has(v)) return "pending";
  return "ok";
}

// CheckRun has a `name` property (even if undefined); a StatusContext uses
// `context`. So `name === undefined` identifies a StatusContext.
function checkName(c: any): string | undefined {
  return c.name === undefined ? c.context || undefined : c.name || undefined;
}

// Re-runs of one check share a name AND a workflow, and only the newest of them
// still describes reality — a check that failed and was re-run to green stayed
// red here forever, which also held the PR out of Ready to merge.
//
// Runs that only share a name are a different thing: two workflows can each
// publish "build", both required, and collapsing them to the newest would hide
// a real failure. So the key is the workflow, and anything we cannot prove came
// from one — a status context, a check from an app that reports no workflow —
// keeps its own bucket and the old worst-wins rule.
function reRunKey(c: any, index: number): string {
  const workflow = c.checkSuite?.workflowRun?.workflow?.name;
  return workflow ? `workflow:${workflow}` : `solo:${index}`;
}

// Still running outranks finished: a run with no completedAt is the attempt in
// flight, and sorting it below a finished older one would report a result
// GitHub has already superseded.
function newestRun(runs: any[]): any {
  return runs.reduce(
    (newest: any, r: any) =>
      !r.completedAt || (newest.completedAt && r.completedAt > newest.completedAt) ? r : newest,
    // Seeded rather than letting reduce take the first element implicitly: that
    // form throws on an empty array. Buckets are never empty by construction,
    // but the throw would be a TypeError from inside a parser, and there is no
    // reading of a rollup where that is the useful failure.
    runs[0],
  );
}

// Effective status of a named group, by precedence:
// failing (any FAILURE/ERROR/TIMED_OUT) > pending (any PENDING/…) > ok —
// applied across workflows, after each workflow is reduced to its latest run.
function groupStatus(runs: any[]): "failing" | "pending" | "ok" {
  const buckets = new Map<string, any[]>();
  runs.forEach((r: any, i: number) => {
    const key = reRunKey(r, i);
    buckets.set(key, [...(buckets.get(key) ?? []), r]);
  });
  const current = Array.from(buckets.values(), newestRun);
  if (current.some((r: any) => classify(r) === "failing")) return "failing";
  if (current.some((r: any) => classify(r) === "pending")) return "pending";
  return "ok";
}

function groupByName(ctxs: any[]): { named: Map<string, any[]>; unnamed: any[] } {
  const named = new Map<string, any[]>();
  const unnamed: any[] = [];
  for (const c of ctxs) {
    const name = checkName(c);
    if (name) named.set(name, [...(named.get(name) ?? []), c]);
    else unnamed.push(c);
  }
  return { named, unnamed };
}

function computeCheckRollup(ctxs: any[]): {
  failing: string[];
  pending: string[];
  failingChecks: number;
  pendingChecks: number;
  checkNames: string[];
} {
  const { named, unnamed } = groupByName(ctxs);

  const failing: string[] = [];
  const pending: string[] = [];
  for (const [name, runs] of named) {
    const status = groupStatus(runs);
    if (status === "failing") failing.push(name);
    else if (status === "pending") pending.push(name);
  }

  // Unnamed checks can't be grouped; count each individually.
  const unnamedStatuses = unnamed.map(classify);
  const failingChecks =
    failing.length + unnamedStatuses.filter((k) => k === "failing").length;
  const pendingChecks =
    pending.length + unnamedStatuses.filter((k) => k === "pending").length;

  return {
    failing,
    pending,
    failingChecks,
    pendingChecks,
    checkNames: Array.from(named.keys()),
  };
}

/**
 * Returns true when a BLOCKED PR is blocked only by out-of-date/push-auth
 * (bot-handled merge), not by a missing check or review: BLOCKED, APPROVED, and
 * no failing/pending check.
 *
 * We can't simply trust statusCheckRollup.state === "SUCCESS": GitHub reports the
 * rollup as FAILURE when a check NAME has a stale/superseded run (e.g. a CANCELLED
 * run later re-run to SUCCESS under the same name) even though the UI, which groups
 * by name and shows the latest, says every check passed. So: trust an explicit
 * SUCCESS rollup (even with no visible contexts), otherwise fall back to our own
 * per-name grouping (computeCheckRollup) — but only when contexts are actually
 * present. A non-SUCCESS rollup with NO contexts is an unexplained failure with no
 * positive evidence, so it stays blocked.
 */
function isReadyViaBlocked(node: any): boolean {
  if (node.mergeStateStatus !== "BLOCKED" || node.reviewDecision !== "APPROVED") {
    return false;
  }
  const rollup = node.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  if (rollup?.state === "SUCCESS") return true;
  const ctxs = rollup?.contexts?.nodes ?? [];
  if (ctxs.length === 0) return false;
  const { failingChecks, pendingChecks } = computeCheckRollup(ctxs);
  return failingChecks === 0 && pendingChecks === 0;
}

/** Out of date, and nothing else holding it up.
 *
 * mergeStateStatus is a single value with a priority order, and BEHIND outranks
 * UNSTABLE: a PR whose branch is behind reports BEHIND even while a check is red
 * or still running. Reading BEHIND on its own as "mergeable once updated" put
 * those PRs in the ready list while the check rollup put the same PRs in the
 * stuck list, so one PR sat in both at once. Only the ones with nothing failing
 * and nothing running are merely out of date. */
function isBehindAndGreen(node: any): boolean {
  if (node.mergeStateStatus !== "BEHIND") return false;
  const ctxs = node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [];
  const { failingChecks, pendingChecks } = computeCheckRollup(ctxs);
  return failingChecks === 0 && pendingChecks === 0;
}

/**
 * GitHub's reviewDecision, minus a changes-requested verdict nobody is still
 * making.
 *
 * CHANGES_REQUESTED survives until the reviewer approves or their review is
 * dismissed: a later comment-only review from the same person leaves the
 * verdict standing, while the PR page's reviewer list — which shows each
 * reviewer's LATEST review — stops showing the red mark. Reading the verdict
 * alone told people to address feedback that had already been answered, on a
 * PR GitHub itself no longer draws that way.
 *
 * So the verdict is only trusted while some reviewer's latest review still
 * asks for changes. When none does, the PR is waiting on review rather than on
 * the author — REVIEW_REQUIRED, not nothing, because it is still unapproved.
 * Every other verdict is passed through: they are not sticky in this way.
 */
function supersededDecision(node: any): string {
  const decision: string = node.reviewDecision ?? "";
  if (decision !== "CHANGES_REQUESTED") return decision;
  const latest: any[] = node.latestReviews?.nodes ?? [];
  // No reviews under a CHANGES_REQUESTED verdict is not a state GitHub
  // produces; trusting the verdict is the safe reading of an impossible one.
  if (latest.length === 0) return decision;
  return latest.some((r: any) => r?.state === "CHANGES_REQUESTED") ? decision : "REVIEW_REQUIRED";
}

export function parseStuckPrs(raw: any): StuckPr[] {
  return searchNodes(raw)
    .filter((n: any) => n?.id)
    .map((n: any) => {
      const commit = n.commits?.nodes?.[0]?.commit ?? {};
      const ctxs = commit.statusCheckRollup?.contexts?.nodes ?? [];
      const { failing, pending, failingChecks, pendingChecks, checkNames } = computeCheckRollup(ctxs);
      // A PR is "blocked" (shown in the stuck list even with green checks) when
      // branch protection blocks it (BLOCKED) or it has merge conflicts (DIRTY).
      // Both states prevent merging regardless of check results. BEHIND is NOT
      // blocked — a merely out-of-date PR is otherwise mergeable and is surfaced
      // in the ready-to-merge list with a "Needs update" badge instead.
      // NOTE: BLOCKED+SUCCESS+APPROVED PRs are kept here too (readyViaBlocked:true);
      // the Dashboard decides which list they land in based on awaitingChecks.
      const blocked = n.mergeStateStatus === "BLOCKED" || n.mergeStateStatus === "DIRTY";
      const readyViaBlocked = isReadyViaBlocked(n);
      const mergeState: string = n.mergeStateStatus ?? "";
      return {
        id: n.id, title: n.title, url: n.url, number: n.number,
        repo: n.repository?.nameWithOwner ?? "",
        failingChecks, pendingChecks, failing, pending,
        checkNames,
        isDraft: n.isDraft ?? false,
        blocked,
        readyViaBlocked,
        reviewDecision: supersededDecision(n),
        mergeState,
        stuckSince: commit.pushedDate ?? commit.committedDate ?? "",
      } as StuckPr;
    })
    .filter((p: StuckPr) => p.failingChecks > 0 || p.pendingChecks > 0 || p.blocked);
}

export function parseReviewRequests(raw: any, viewerLogin: string): ReviewRequest[] {
  return searchNodes(raw)
    .filter((n: any) => n?.id)
    .map((n: any) => {
      // Use the LATEST review request for the viewer, not the first — a
      // re-request adds another REVIEW_REQUESTED_EVENT, and the age should
      // count from that, not the original request days earlier. timelineItems
      // are chronological, so the last match is the most recent.
      const mine = (n.timelineItems?.nodes ?? []).findLast(
        (e: any) => e?.requestedReviewer?.login === viewerLogin,
      );
      return {
        id: n.id, title: n.title, url: n.url, number: n.number,
        repo: n.repository?.nameWithOwner ?? "",
        author: n.author?.login ?? "unknown",
        requestedAt: mine?.createdAt ?? n.updatedAt ?? "",
        // Whether that timestamp is the request itself or the PR's updatedAt
        // standing in for it. The fallback moves on any activity at all, so
        // only the real one can be treated as "this was requested again".
        requestedDirectly: !!mine?.createdAt,
        isDraft: n.isDraft ?? false,
      } as ReviewRequest;
    });
}

export const PR_COMMENTS_QUERY = `
  query($q: String!, $withStarter: Boolean!, $withReviews: Boolean!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id number url repository { nameWithOwner }
        # The body of a submitted review — the second of GitHub's three comment
        # surfaces, and the one that made this issue: a question typed into the
        # review box lives here, not in reviewThreads, so a PR with no inline
        # thread at all could carry an unanswered question invisibly.
        #
        # Own-PR leg only. On someone else's PR a review body is either the
        # viewer's own (waiting on the author) or another reviewer's (waiting on
        # nobody in particular) — neither is the viewer's to answer, and this is
        # the heaviest query in the app, so the reviewed leg does not pay for it.
        reviews(last: 20) @include(if: $withReviews) { nodes {
          id url bodyText submittedAt
          author { login __typename }
          reactionGroups { viewerHasReacted }
        } }
        # Not rows — the answer signal. A review body has no replies, so
        # "answered" has to be read off the PR: the viewer saying anything in the
        # conversation after the review was submitted. See parsePrComments.
        #
        # A window, so on a PR that stays chatty long after the viewer answered,
        # their answer can fall out of it and the row comes back. That is the
        # forgiving failure this heuristic already accepts — a handled row costs
        # a glance, where the other direction hides an unanswered question — so
        # it stays a window rather than growing the heaviest query in the app.
        comments(last: 20) @include(if: $withReviews) { nodes {
          author { login } createdAt
        } }
        reviewThreads(first: 50) { nodes {
          id isResolved path
          # Who opened the thread. On the viewer's own PRs every unresolved
          # thread is theirs to answer, but on someone else's PR only the
          # threads the viewer started are — see parsePrComments. This is the
          # heaviest query in the app and it now runs twice per refresh, so the
          # own-PR leg, which never reads this, does not pay for it.
          starter: comments(first: 1) @include(if: $withStarter) { nodes { author { login } } }
          comments(last: 1) { nodes {
            author { login __typename }
            bodyText createdAt url
            reactionGroups { viewerHasReacted }
          } }
        } }
      } }
    }
      ${RATE_LIMIT}
  }`;

// The shape every search parser starts from. Array-checked rather than
// ?? []-defaulted: nodes arriving as anything but an array would make the very
// next .filter throw, and /api/pr-comments has no try/catch to turn that into
// the documented 502 — it would escape as a 500 and take the other search's
// results down with it.
function searchNodes(raw: any): any[] {
  const nodes = raw?.search?.nodes;
  return Array.isArray(nodes) ? nodes : [];
}

// Long enough to convey what the comment asks for, short enough that a row stays
// a scannable inbox line. The card also clamps to two lines (see PrRow).
const PREVIEW_MAX = 140;

// bodyText carries the comment's newlines and indentation; a two-line clamp on
// raw text would render mostly blank, so collapse whitespace before truncating.
function previewOf(bodyText: string): string {
  const flat = bodyText.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_MAX ? `${flat.slice(0, PREVIEW_MAX)}…` : flat;
}

/**
 * Inline review comments on the viewer's own PRs that are still waiting on a reply.
 *
 * A thread awaits the viewer when it is unresolved AND its most recent comment is
 * someone else's — replying adds a comment, so a viewer-authored last comment means
 * the ball is back in the reviewer's court even while the thread stays unresolved.
 *
 * Bot comments are kept (with isBot set) rather than dropped here: the Dashboard
 * hides them behind a toggle, so filtering server-side would make the toggle a no-op.
 *
 * A viewer emoji reaction on the last comment (viewerReacted) is surfaced the same
 * way: reacting is how the viewer acknowledges a comment without replying, and the
 * Dashboard hides acknowledged threads behind a toggle.
 *
 * viewerStartedOnly narrows this to threads the viewer opened, which is what the
 * same question means on someone ELSE's PR: every unresolved thread there is
 * waiting on somebody, but only the ones the viewer raised are waiting on the
 * viewer. On the viewer's own PRs it stays off — the PR is theirs, so every
 * unanswered thread is theirs to answer.
 */
export function parsePrComments(
  raw: any,
  viewerLogin: string,
  viewerStartedOnly = false,
): PrComment[] {
  return searchNodes(raw)
    .filter((pr: any) => pr?.id)
    .flatMap((pr: any) => [...reviewBodiesOf(pr, viewerLogin), ...threadsOf(pr, viewerLogin, viewerStartedOnly)]);
}

/**
 * Review bodies still waiting on the viewer.
 *
 * An inline thread says whose turn it is structurally — it has replies, and a
 * resolve bit. A review body has neither: the author answers in a conversation
 * comment or another review, with nothing linking the two. So the turn is read
 * off the PR instead — the review is waiting while the viewer has said nothing
 * in the conversation since it was submitted.
 *
 * That is a heuristic, and it is deliberately the forgiving one: a viewer who
 * answered somewhere it cannot see (a thread reply, a commit message) sees a row
 * that is already handled, which costs a glance. The other direction would hide
 * an unanswered question, which is the bug this exists to fix.
 *
 * Reacting is the manual escape hatch, exactly as it is for threads: the emoji
 * is how the viewer acknowledges without replying, and the Dashboard hides
 * reacted rows behind a toggle.
 */
function reviewBodiesOf(pr: any, viewerLogin: string): PrComment[] {
  const reviews = pr.reviews?.nodes;
  // Absent rather than empty on the reviewed leg, which does not request them.
  if (!Array.isArray(reviews)) return [];
  // "" sorts before every ISO timestamp, so a viewer who has not spoken on this
  // PR leaves every review body pending without a second code path.
  const viewerSpokeAt = (pr.comments?.nodes ?? [])
    .filter((c: any) => c?.author?.login === viewerLogin)
    .reduce((latest: string, c: any) => (c.createdAt > latest ? c.createdAt : latest), "");
  return reviews
    .filter((r: any) => r?.id && r.submittedAt > viewerSpokeAt)
    .filter((r: any) => r.author?.login && r.author.login !== viewerLogin)
    // An APPROVED review with no text is the common case and says nothing that
    // can be replied to. Trimmed, because whitespace is not a question either.
    .filter((r: any) => (r.bodyText ?? "").trim() !== "")
    .map((r: any) => ({
      id: r.id,
      prId: pr.id,
      url: r.url ?? pr.url,
      repo: pr.repository?.nameWithOwner ?? "",
      number: pr.number,
      author: r.author.login,
      isBot: r.author.__typename === "Bot",
      // A review body hangs on the PR, not on a file.
      path: "",
      source: "review",
      preview: previewOf(r.bodyText),
      // Never absent past the filter above: an undefined submittedAt does not
      // compare greater than "", so a review without one is already gone.
      commentedAt: r.submittedAt,
      viewerReacted: (r.reactionGroups ?? []).some((g: any) => g?.viewerHasReacted === true),
      viewerStarted: false,
    } as PrComment));
}

function threadsOf(pr: any, viewerLogin: string, viewerStartedOnly: boolean): PrComment[] {
  return (pr.reviewThreads?.nodes ?? [])
    .filter((t: any) => t?.isResolved === false)
    .map((thread: any) => ({ thread, last: thread.comments?.nodes?.[0] }))
    .filter(({ thread }: any) =>
      !viewerStartedOnly ||
      thread.starter?.nodes?.[0]?.author?.login === viewerLogin,
    )
    .filter(({ last }: any) => last?.author?.login && last.author.login !== viewerLogin)
    .map(({ thread, last }: any) => ({
      id: thread.id,
      prId: pr.id,
      url: last.url ?? pr.url,
      repo: pr.repository?.nameWithOwner ?? "",
      number: pr.number,
      author: last.author.login,
      isBot: last.author.__typename === "Bot",
      path: thread.path ?? "",
      source: "thread",
      preview: previewOf(last.bodyText ?? ""),
      commentedAt: last.createdAt ?? "",
      viewerReacted: (last.reactionGroups ?? []).some((g: any) => g?.viewerHasReacted === true),
      // Only the viewer-started pass can produce these, and the Dashboard
      // reads it to know the thread stands on its own — it is waiting on the
      // viewer whether or not that PR is on the board.
      viewerStarted: viewerStartedOnly,
    } as PrComment));
}

export function parseOrgs(raw: any): Org[] {
  return (raw?.viewer?.organizations?.nodes ?? []).map((o: any) => ({
    login: o.login, avatarUrl: o.avatarUrl,
  }));
}

export const READY_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft updatedAt
        mergeStateStatus reviewDecision
        repository { nameWithOwner }
        commits(last: 1) { nodes { commit {
          pushedDate committedDate
          ${CHECK_ROLLUP}
        } } }
      } }
    }
      ${RATE_LIMIT}
  }`;

export const CLOSED_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number merged mergedAt closedAt
        repository { nameWithOwner }
      } }
    }
      ${RATE_LIMIT}
  }`;

export function parseClosedPrs(raw: any): ClosedPr[] {
  return searchNodes(raw)
    .filter((n: any) => n?.id)
    .map((n: any) => ({
      id: n.id,
      title: n.title,
      url: n.url,
      number: n.number,
      repo: n.repository?.nameWithOwner ?? "",
      merged: !!n.merged,
      endedAt: n.mergedAt ?? n.closedAt ?? "",
    } as ClosedPr));
}

// $login rather than @me: reviews(author:) takes a literal login, and it is the
// same viewer the session already resolved for parsePrComments.
export const REVIEWED_PRS_QUERY = `
  query($q: String!, $login: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft
        repository { nameWithOwner }
        author { login }
        # DISMISSED belongs here even though it is not a verdict: without it a
        # dismissed review falls through to an older one, so the row badges a
        # stale opinion — or the PR vanishes from the list while reviewed-by:@me
        # still matches it.
        reviews(last: 1, author: $login, states: [APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED]) {
          nodes { state submittedAt }
        }
        commits(last: 1) { nodes { commit { pushedDate committedDate } } }
      } }
    }
      ${RATE_LIMIT}
  }`;

// The verdicts a submitted review can carry. Checked rather than trusted: the
// GraphQL response is untyped at this boundary, and a state the UI has no badge
// for would render blank.
const REVIEW_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"]);

/**
 * Open PRs the viewer has already reviewed — the ones "Waiting on your review"
 * dropped the moment the review was submitted.
 *
 * A PR the viewer is being asked to review AGAIN is not history: GitHub reports
 * it under review-requested:@me as well, and the Dashboard keeps it there so no
 * PR sits in two lists.
 *
 * PENDING reviews are excluded by the query's states filter — an unsubmitted
 * draft review is not a review anyone else can see.
 */
export function parseReviewedPrs(raw: any): ReviewedPr[] {
  return searchNodes(raw)
    .filter((n: any) => n?.id)
    .map((n: any) => {
      const review = n.reviews?.nodes?.[0] ?? {};
      const commit = n.commits?.nodes?.[0]?.commit ?? {};
      const pushedAt = commit.pushedDate ?? commit.committedDate ?? "";
      const reviewedAt = review.submittedAt ?? "";
      return {
        id: n.id,
        title: n.title,
        url: n.url,
        number: n.number,
        repo: n.repository?.nameWithOwner ?? "",
        author: n.author?.login ?? "unknown",
        // Anything unrecognised reads as the weakest verdict — it says nothing
        // about the code, which is what "Commented" means.
        state: REVIEW_STATES.has(review.state) ? review.state : "COMMENTED",
        reviewedAt,
        // A push after the review is the reason to come back — the author
        // answered with code. Parsed rather than string-compared: the
        // timestamps come from two different fields, and only one of them
        // being absent should read as "no news", not as "newer".
        updatedSince:
          !!pushedAt && !!reviewedAt && Date.parse(pushedAt) > Date.parse(reviewedAt),
        isDraft: n.isDraft ?? false,
      } as ReviewedPr;
    })
    // No submitted review from the viewer means search matched on something we
    // can't date — without a review time the row has nothing to say.
    .filter((pr: ReviewedPr) => pr.reviewedAt !== "");
}

export const REPO_SEARCH_QUERY = `
  query($q: String!) {
    search(query: $q, type: REPOSITORY, first: 20) {
      nodes {
        ... on Repository {
          nameWithOwner
        }
      }
    }
  }`;

export function parseRepoSearch(raw: any): string[] {
  const nodes: any[] = searchNodes(raw);
  const seen = new Set<string>();
  const results: string[] = [];
  for (const node of nodes) {
    const name: string | undefined = node?.nameWithOwner;
    if (name && !seen.has(name)) {
      seen.add(name);
      results.push(name);
    }
  }
  return results;
}

export function parseReadyPrs(raw: any): ReadyPr[] {
  // mergeStateStatus === "CLEAN" is GitHub's own "mergeable now" signal.
  // If branch protection requires a review, a not-yet-approved PR reports BLOCKED
  // (not CLEAN), so CLEAN already implies the review gate is satisfied (or not
  // required, as is common for personal-account repos). No separate reviewDecision
  // check is needed.
  // Additionally, a BLOCKED PR with rollupState SUCCESS and reviewDecision APPROVED
  // is blocked only by out-of-date/push-auth (bot-handled merge), not by a missing
  // check or review, and is routed to the ready bucket with needsUpdate:true.
  return searchNodes(raw)
    .filter((n: any) => n?.id)
    .filter((n: any) => n.mergeStateStatus === "CLEAN" || isBehindAndGreen(n) || isReadyViaBlocked(n))
    .filter((n: any) => !n.isDraft)
    .map((n: any) => {
      const commit = n.commits?.nodes?.[0]?.commit ?? {};
      const ctxs = commit.statusCheckRollup?.contexts?.nodes ?? [];
      const { checkNames } = computeCheckRollup(ctxs);
      return {
        id: n.id,
        title: n.title,
        url: n.url,
        number: n.number,
        repo: n.repository?.nameWithOwner ?? "",
        readySince: commit.pushedDate ?? commit.committedDate ?? n.updatedAt ?? "",
        needsUpdate: n.mergeStateStatus !== "CLEAN",
        checkNames,
        viaBlocked: isReadyViaBlocked(n),
      } as ReadyPr;
    });
}

