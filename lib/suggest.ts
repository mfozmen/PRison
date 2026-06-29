import type { StuckPr, ReviewRequest, ReadyPr } from "./types";

export type Suggestion = { text: string; href: string };

export function suggestStuck(pr: StuckPr): Suggestion {
  const href = `${pr.url}/checks`;
  if (pr.failingChecks > 0) return { text: "Re-run failed checks", href };
  if (pr.pendingChecks > 0) return { text: "Investigate pending CI", href };
  // Blocked with no visible failing/pending checks — required checks haven't
  // reported yet (e.g. a manual stage); the Checks tab lists them on GitHub.
  return { text: "See required checks", href };
}

export function suggestReview(req: ReviewRequest): Suggestion {
  return { text: `Review to unblock ${req.author}`, href: `${req.url}/files` };
}

export function suggestReady(pr: ReadyPr): Suggestion {
  return { text: "Merge on GitHub", href: pr.url };
}
