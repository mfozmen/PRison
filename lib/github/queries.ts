/* eslint-disable @typescript-eslint/no-explicit-any */
// Raw GraphQL responses are intentionally untyped at the boundary; parsers
// convert them to domain types as the first step.
import type { Org, StuckPr, ReviewRequest, ReadyPr } from "@/lib/types";

// scope is optional: when omitted, the search spans every repo the token can
// see (the user's personal account plus all accessible organizations).
// Callers pass a ready-made qualifier string such as "org:acme" or "user:mfozmen".
export function searchQuery(kind: "author" | "review" | "ready", scope?: string): string {
  const scopePart = scope ? ` ${scope}` : "";
  // "ready" fetches all of the user's open PRs; parseReadyPrs then keeps the
  // ones GitHub reports as mergeable now (mergeStateStatus CLEAN, not draft).
  // We do NOT filter on review:approved here — a CLEAN PR is already mergeable
  // (including any required review), and some repos don't require review.
  const who = kind === "review" ? "review-requested:@me" : "author:@me";
  return `is:open is:pr ${who}${scopePart}`;
}

export const VIEWER_QUERY = `query { viewer { login } }`;

export const ORGS_QUERY = `
  query { viewer { organizations(first: 100) { nodes { login avatarUrl } } } }`;

export const STUCK_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft mergeStateStatus
        repository { nameWithOwner }
        commits(last: 1) { nodes { commit {
          pushedDate committedDate
          statusCheckRollup { contexts(first: 100) { nodes {
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

export function parseStuckPrs(raw: any): StuckPr[] {
  return (raw?.search?.nodes ?? [])
    .filter((n: any) => n?.id)
    .map((n: any) => {
      const commit = n.commits?.nodes?.[0]?.commit ?? {};
      const ctxs = commit.statusCheckRollup?.contexts?.nodes ?? [];
      const { failing, pending, failingChecks, pendingChecks, checkNames } = computeCheckRollup(ctxs);
      // A PR is "blocked" (shown in the stuck list even with green checks) when
      // branch protection blocks it (BLOCKED), it is out of date (BEHIND), or it
      // has merge conflicts (DIRTY). All three states prevent merging regardless
      // of check results.
      const blocked = n.mergeStateStatus === "BLOCKED" || n.mergeStateStatus === "BEHIND" || n.mergeStateStatus === "DIRTY";
      const mergeState: string = n.mergeStateStatus ?? "";
      return {
        id: n.id, title: n.title, url: n.url, number: n.number,
        repo: n.repository?.nameWithOwner ?? "",
        failingChecks, pendingChecks, failing, pending,
        checkNames,
        isDraft: n.isDraft ?? false,
        blocked,
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
      const mine = (n.timelineItems?.nodes ?? []).find(
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
        mergeStateStatus
        repository { nameWithOwner }
        commits(last: 1) { nodes { commit {
          pushedDate committedDate
        } } }
      } }
    }
  }`;

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
  return (raw?.search?.nodes ?? [])
    .filter((n: any) => n?.id)
    .filter((n: any) => n.mergeStateStatus === "CLEAN")
    .filter((n: any) => !n.isDraft)
    .map((n: any) => {
      const commit = n.commits?.nodes?.[0]?.commit ?? {};
      return {
        id: n.id,
        title: n.title,
        url: n.url,
        number: n.number,
        repo: n.repository?.nameWithOwner ?? "",
        readySince: commit.pushedDate ?? commit.committedDate ?? n.updatedAt ?? "",
      } as ReadyPr;
    });
}
