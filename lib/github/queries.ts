/* eslint-disable @typescript-eslint/no-explicit-any */
// Raw GraphQL responses are intentionally untyped at the boundary; parsers
// convert them to domain types as the first step.
import type { Org, StuckPr, ReviewRequest, ReadyPr, PrComment, ClosedPr, ReviewedPr } from "@/lib/types";

// scope is optional: when omitted, the search spans every repo the token can
// see (the user's personal account plus all accessible organizations).
// Callers pass a ready-made qualifier string such as "org:acme" or "user:mfozmen".
export function searchQuery(kind: "author" | "review" | "ready" | "closed" | "reviewed", scope?: string): string {
  const scopePart = scope ? ` ${scope}` : "";
  // "ready" fetches all of the user's open PRs; parseReadyPrs then keeps the
  // ones GitHub reports as mergeable now (mergeStateStatus CLEAN, not draft).
  // We do NOT filter on review:approved here — a CLEAN PR is already mergeable
  // (including any required review), and some repos don't require review.
  // "reviewed" is the other side of "review": PRs the viewer has already
  // submitted a review on, which review-requested:@me no longer returns.
  // -author:@me on "reviewed": GitHub accepts a COMMENTED review on your own PR
  // (inline self-annotations submit as one), and reviewed-by:@me returns it. Your
  // own PR is already in the work queues, so it is not history to look back at.
  const who =
    kind === "review"
      ? "review-requested:@me"
      : kind === "reviewed"
        ? "reviewed-by:@me -author:@me"
        : "author:@me";
  // "closed" fetches the user's finished PRs (merged is a subset of closed).
  const state = kind === "closed" ? "is:closed" : "is:open";
  // GitHub search has no merge-order sort; sort:updated-desc just biases the
  // fixed 50-row window toward recent activity. parseClosedPrs' consumer
  // re-sorts by endedAt client-side for true newest-close-first order.
  const sort = kind === "closed" ? " sort:updated-desc" : "";
  return `${state} is:pr ${who}${scopePart}${sort}`;
}

export const VIEWER_QUERY = `query { viewer { login } }`;

export const ORGS_QUERY = `
  query { viewer { organizations(first: 100) { nodes { login avatarUrl } } } }`;

export const STUCK_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft mergeStateStatus reviewDecision
        repository { nameWithOwner }
        commits(last: 1) { nodes { commit {
          pushedDate committedDate
          statusCheckRollup { state contexts(first: 100) { nodes {
            ... on CheckRun { name status conclusion }
            ... on StatusContext { context state }
          } } }
        } } }
      } }
    }
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

// Effective status of a named group, by precedence:
// failing (any FAILURE/ERROR/TIMED_OUT) > pending (any PENDING/…) > ok.
function groupStatus(runs: any[]): "failing" | "pending" | "ok" {
  if (runs.some((r: any) => classify(r) === "failing")) return "failing";
  if (runs.some((r: any) => classify(r) === "pending")) return "pending";
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

export function parseStuckPrs(raw: any): StuckPr[] {
  return (raw?.search?.nodes ?? [])
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
        reviewDecision: n.reviewDecision ?? "",
        mergeState,
        stuckSince: commit.pushedDate ?? commit.committedDate ?? "",
      } as StuckPr;
    })
    .filter((p: StuckPr) => p.failingChecks > 0 || p.pendingChecks > 0 || p.blocked);
}

export function parseReviewRequests(raw: any, viewerLogin: string): ReviewRequest[] {
  return (raw?.search?.nodes ?? [])
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
        isDraft: n.isDraft ?? false,
      } as ReviewRequest;
    });
}

export const PR_COMMENTS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id number url repository { nameWithOwner }
        reviewThreads(first: 50) { nodes {
          id isResolved path
          # Who opened the thread. On the viewer's own PRs every unresolved
          # thread is theirs to answer, but on someone else's PR only the
          # threads the viewer started are — see parsePrComments.
          starter: comments(first: 1) { nodes { author { login } } }
          comments(last: 1) { nodes {
            author { login __typename }
            bodyText createdAt url
            reactionGroups { viewerHasReacted }
          } }
        } }
      } }
    }
  }`;

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
  return (raw?.search?.nodes ?? [])
    .filter((pr: any) => pr?.id)
    .flatMap((pr: any) =>
      (pr.reviewThreads?.nodes ?? [])
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
          preview: previewOf(last.bodyText ?? ""),
          commentedAt: last.createdAt ?? "",
          viewerReacted: (last.reactionGroups ?? []).some((g: any) => g?.viewerHasReacted === true),
        } as PrComment)),
    );
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
          statusCheckRollup { state contexts(first: 100) { nodes {
            ... on CheckRun { name status conclusion }
            ... on StatusContext { context state }
          } } }
        } } }
      } }
    }
  }`;

export const CLOSED_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number merged mergedAt closedAt
        repository { nameWithOwner }
      } }
    }
  }`;

export function parseClosedPrs(raw: any): ClosedPr[] {
  return (raw?.search?.nodes ?? [])
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
        reviews(last: 1, author: $login, states: [APPROVED, CHANGES_REQUESTED, COMMENTED]) {
          nodes { state submittedAt }
        }
        commits(last: 1) { nodes { commit { pushedDate committedDate } } }
      } }
    }
  }`;

// The verdicts a submitted review can carry. Checked rather than trusted: the
// GraphQL response is untyped at this boundary, and a state the UI has no badge
// for would render blank.
const REVIEW_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]);

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
  return (raw?.search?.nodes ?? [])
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
  const nodes: any[] = raw?.search?.nodes ?? [];
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
  return (raw?.search?.nodes ?? [])
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

// PRison's own latest release, for the update check in Settings → About.
// `latestRelease` is GitHub's own answer to "what should someone install",
// so drafts and prereleases are excluded without us filtering for them.
export const LATEST_RELEASE_QUERY = `
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) { latestRelease { tagName } }
  }`;

export function parseLatestRelease(raw: any): string | undefined {
  return raw?.repository?.latestRelease?.tagName ?? undefined;
}
