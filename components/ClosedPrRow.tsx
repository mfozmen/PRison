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
      <div className="flex w-7 shrink-0 flex-col items-center self-start">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            pr.merged ? "bg-accent/15 text-accent" : "bg-border text-muted"
          }`}
        >
          {pr.merged ? (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="6" cy="6" r="2.5" />
              <circle cx="6" cy="18" r="2.5" />
              <circle cx="18" cy="12" r="2.5" />
              <path d="M6 8.5v7M8.3 7.2C12 9 15 10 15.6 11" />
            </svg>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          )}
        </div>
        {!last && <span aria-hidden="true" className="mt-1.5 h-[9px] w-px bg-border" />}
      </div>
      <div className={`min-w-0 flex-1 pt-[3px] ${last ? "pb-1" : "pb-4"}`}>
        <div className="flex justify-between gap-3">
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${pr.title} on GitHub`}
            className={`text-sm font-medium leading-[normal] transition-colors after:ml-1 after:content-['↗'] hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm ${pr.merged ? "text-foreground" : "text-[color-mix(in_srgb,var(--fg)_60%,var(--muted))]"}`}
          >
            {pr.title}
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
