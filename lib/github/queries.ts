/* eslint-disable @typescript-eslint/no-explicit-any */
// Raw GraphQL responses are intentionally untyped at the boundary; parsers
// convert them to domain types as the first step.
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
        repo: n.repository?.nameWithOwner ?? "",
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
        repo: n.repository?.nameWithOwner ?? "",
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
