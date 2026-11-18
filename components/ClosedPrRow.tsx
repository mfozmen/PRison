import { relativeAge } from "@/lib/prioritize";
import type { ClosedPr } from "@/lib/types";

export interface ClosedPrRowProps {
  pr: ClosedPr;
  now: Date;
  /** The last row on screen draws no connector below its marker. */
  last?: boolean;
}

// A finished-PR row on a short timeline: history, not a work item — so no
// urgency-coloured age and no "next action" CTA (unlike PrRow). Just a link back
// to the PR, its repo coordinates, whether it merged, and how long ago it closed.
export function ClosedPrRow({ pr, now, last }: ClosedPrRowProps) {
  return (
    <div className="flex gap-3.5">
      <div className="flex w-7 shrink-0 flex-col items-center pt-2">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          pr.merged ? "bg-accent/15 text-accent" : "bg-border text-muted"
        }`}
      >
        {pr.merged ? (
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="6" cy="6" r="2.5" />
            <circle cx="6" cy="18" r="2.5" />
            <circle cx="18" cy="12" r="2.5" />
            <path d="M6 8.5v7M8.3 7.2C12 9 15 10 15.6 11" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        )}
      </div>
      {!last && <span aria-hidden="true" className="mt-1.5 w-px flex-1 bg-border" />}
      </div>
      <div className={`min-w-0 flex-1 pt-[11px] ${last ? "pb-1" : "pb-4"}`}>
        <div className="flex justify-between gap-3">
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${pr.title} on GitHub`}
            className={`text-sm font-medium transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm ${pr.merged ? "text-foreground" : "text-[color-mix(in_srgb,var(--fg)_80%,var(--muted))]"}`}
          >
            {pr.title}
          <svg aria-hidden="true" className="ml-1 inline-block -mt-0.5 shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3.5 3H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8.5M7 1h4m0 0v4m0-4L5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <span className="shrink-0 text-[13px] leading-normal text-muted">
            {relativeAge(pr.endedAt, now)} ago
          </span>
        </div>
        <div className="mt-0.5 font-mono text-xs leading-relaxed text-muted">
          {pr.repo} #{pr.number} ·{" "}
          <span className={`font-sans font-medium ${pr.merged ? "text-accent" : ""}`}>
            {pr.merged ? "Merged" : "Closed without merge"}
          </span>
        </div>
      </div>
    </div>
  );
}
