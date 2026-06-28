/* eslint-disable @typescript-eslint/no-explicit-any */
// Raw GraphQL responses are intentionally untyped at the boundary; parsers
// convert them to domain types as the first step.
import type { Org, StuckPr, ReviewRequest, ReadyPr } from "@/lib/types";

// org is optional: when omitted, the search spans every repo the token can
// see (the user's personal account plus all accessible organizations).
export function searchQuery(kind: "author" | "review" | "ready", org?: string): string {
  const scope = org ? ` org:${org}` : "";
  if (kind === "ready") return `is:open is:pr author:@me review:approved${scope}`;
  const who = kind === "author" ? "author:@me" : "review-requested:@me";
  return `is:open is:pr ${who}${scope}`;
}

export const VIEWER_QUERY = `query { viewer { login } }`;

export const ORGS_QUERY = `
  query { viewer { organizations(first: 100) { nodes { login avatarUrl } } } }`;

export const STUCK_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes { ... on PullRequest {
        id title url number isDraft
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
      const failing: string[] = [];
      const pending: string[] = [];
      for (const c of ctxs) {
        const k = classify(c);
        // Detect CheckRun vs StatusContext: CheckRun has a `name` property (even if undefined);
        // use ctx.name !== undefined to distinguish. Otherwise treat as StatusContext (ctx.context).
        const checkName: string | undefined =
          c.name !== undefined ? (c.name || undefined) : (c.context || undefined);
        if (k === "failing") {
          failingChecks++;
          if (checkName) failing.push(checkName);
        } else if (k === "pending") {
          pendingChecks++;
          if (checkName) pending.push(checkName);
        }
      }
      return {
        id: n.id, title: n.title, url: n.url, number: n.number,
        repo: n.repository?.nameWithOwner ?? "",
        failingChecks, pendingChecks, failing, pending,
        isDraft: n.isDraft ?? false,
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
        reviewDecision mergeStateStatus
        repository { nameWithOwner }
        commits(last: 1) { nodes { commit {
          pushedDate committedDate
        } } }
      } }
    }
  }`;

export function parseReadyPrs(raw: any): ReadyPr[] {
  return (raw?.search?.nodes ?? [])
    .filter((n: any) => n?.id)
    .filter((n: any) => n.reviewDecision === "APPROVED")
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
