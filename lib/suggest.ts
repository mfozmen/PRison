import type { StuckPr, ReviewRequest, ReadyPr } from "./types";
import { awaitingChecks, type TrackedChecks } from "./tracked-checks";

export type Suggestion = { text: string; href: string };

// A BLOCKED PR whose checks are green can still be held by a review gate.
// Shared by suggestStuck and the Dashboard chip so the two never disagree on
// which PRs "need review" (mirrors how awaitingChecks is shared).
export function needsReview(reviewDecision: string): boolean {
  return reviewDecision === "REVIEW_REQUIRED" || reviewDecision === "CHANGES_REQUESTED";
}

// The card chip AND the By-check group header must read the same for a given
// review state — centralize the label so they never drift (same reason as needsReview).
export function reviewDecisionLabel(reviewDecision: string): string {
  return reviewDecision === "CHANGES_REQUESTED" ? "Changes requested" : "Review required";
}

export function suggestStuck(pr: StuckPr): Suggestion {
  const href = `${pr.url}/checks`;
  if (pr.failingChecks > 0) return { text: "Re-run failed checks", href };
  if (pr.pendingChecks > 0) return { text: "Investigate pending CI", href };
  // Merge conflicts block the merge regardless of review state, and the
  // Dashboard's detail note prioritizes DIRTY too — keep the CTA in step.
  if (pr.mergeState === "DIRTY") return { text: "Resolve conflicts", href: pr.url };
  // Checks are green and mergeable — the blocker is a review gate.
  if (pr.reviewDecision === "REVIEW_REQUIRED") return { text: "Request code owner review", href: pr.url };
  if (pr.reviewDecision === "CHANGES_REQUESTED") return { text: "Address review feedback", href: `${pr.url}/files` };
  return { text: "See required checks", href };
}

// "By check" group keys for a stuck PR: the things actually blocking it, so the
// grouping mirrors the card. Beyond failing/pending CI names this includes the
// awaiting tracked checks and the review gate — otherwise a review-blocked PR
// (no failing/pending check) would fall to "Other". Only truly unattributable
// PRs get "Other".
export function stuckGroupKeys(pr: StuckPr, tracked: TrackedChecks): string[] {
  const keys = [
    ...pr.failing,
    ...pr.pending,
    ...awaitingChecks(pr.repo, pr.checkNames, tracked),
  ];
  if (needsReview(pr.reviewDecision)) {
    keys.push(reviewDecisionLabel(pr.reviewDecision));
  }
  const unique = Array.from(new Set(keys));
  return unique.length > 0 ? unique : ["Other"];
}

export function suggestReview(req: ReviewRequest): Suggestion {
  return { text: `Review to unblock ${req.author}`, href: `${req.url}/files` };
}

export function suggestReady(pr: ReadyPr): Suggestion {
  return { text: "Merge on GitHub", href: pr.url };
}
