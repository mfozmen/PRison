import type { StuckPr, ReviewRequest, ReadyPr } from "./types";

export type Suggestion = { text: string; href: string };

export function suggestStuck(pr: StuckPr): Suggestion {
  const text = pr.failingChecks > 0 ? "Re-run failed checks" : "Investigate pending CI";
  return { text, href: `${pr.url}/checks` };
}

export function suggestReview(req: ReviewRequest): Suggestion {
  return { text: `Review to unblock ${req.author}`, href: `${req.url}/files` };
}

export function suggestReady(pr: ReadyPr): Suggestion {
  return { text: "Merge on GitHub", href: pr.url };
}
