import { relativeAge } from "@/lib/prioritize";
import type { ClosedPr } from "@/lib/types";

export interface ClosedPrRowProps {
  pr: ClosedPr;
  now: Date;
}

// A finished-PR row: history, not a work item — so no urgency-coloured age badge
// and no "next action" CTA (unlike PrRow). Just a link back to the PR, its repo
// coordinates, whether it merged, and how long ago it closed.
export function ClosedPrRow({ pr, now }: ClosedPrRowProps) {
  const verb = pr.merged ? "merged" : "closed";
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface/50 p-4 transition-colors hover:border-border/70 hover:bg-surface">
      <div className="flex items-start justify-between gap-3">
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${pr.title} on GitHub`}
          className="font-medium text-foreground hover:text-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        >
          {pr.title}
          <svg aria-hidden="true" className="inline-block ml-1 -mt-0.5 shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.5 3H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8.5M7 1h4m0 0v4m0-4L5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
            pr.merged
              ? "bg-success/15 text-success ring-success/30"
              : "bg-danger/15 text-danger ring-danger/30"
          }`}
        >
          {pr.merged ? "Merged" : "Closed"}
        </span>
      </div>
      <span className="font-mono text-xs text-muted">
        {pr.repo} #{pr.number}
      </span>
      <span className="mt-1 text-sm text-muted">
        {verb} {relativeAge(pr.endedAt, now)} ago
      </span>
    </div>
  );
}
