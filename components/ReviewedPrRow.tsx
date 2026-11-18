import { relativeAge } from "@/lib/prioritize";
import type { ReviewedPr } from "@/lib/types";

export interface ReviewedPrRowProps {
  pr: ReviewedPr;
  now: Date;
}

// Worded as what *you* did, because this panel is your own history.
const VERDICT: Record<ReviewedPr["state"], { label: string; className: string; tile: string; icon: string }> = {
  APPROVED: { label: "You approved", className: "bg-success/10 text-success", tile: "bg-success/10 text-success", icon: "M20 6 9 17l-5-5" },
  CHANGES_REQUESTED: { label: "You requested changes", className: "bg-danger/10 text-danger", tile: "bg-danger/10 text-danger", icon: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" },
  COMMENTED: { label: "You commented", className: "bg-border text-muted", tile: "bg-border text-muted", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  // Struck through because the verdict no longer stands: the author cleared it.
  DISMISSED: { label: "Dismissed", className: "bg-border text-muted line-through", tile: "bg-border text-muted", icon: "M18 6 6 18M6 6l12 12" },
};

// A PR the viewer has already reviewed: history like ClosedPrRow, not a work
// item — so no urgency-coloured age and no CTA. What it adds is the reason to
// come back: your own verdict, and whether the author has pushed since. That
// second one is the loudest thing in the row; a row with nothing new is dimmed.
export function ReviewedPrRow({ pr, now }: ReviewedPrRowProps) {
  const verdict = VERDICT[pr.state];
  return (
    <div className="flex items-start gap-3.5 py-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${verdict.tile}`}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={verdict.icon} />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${pr.title} on GitHub`}
          className={`text-sm font-medium transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm ${pr.updatedSince ? "text-foreground" : "text-[color-mix(in_srgb,var(--fg)_80%,var(--muted))]"}`}
        >
          {pr.title}
          <svg aria-hidden="true" className="ml-1 inline-block -mt-0.5 shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3.5 3H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8.5M7 1h4m0 0v4m0-4L5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
        <div className="mt-0.5 font-mono text-xs leading-relaxed text-muted">
          {pr.repo} #{pr.number} · {pr.author}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] leading-normal text-muted">
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium leading-normal ${verdict.className}`}>
            {verdict.label}
          </span>
          <span>{relativeAge(pr.reviewedAt, now)} ago</span>
        </div>
      </div>
      {/* The whole point of looking back: they answered with code. */}
      {pr.updatedSince ? (
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-background">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            Updated since
          </span>
          {/* GitHub's files view starts from what changed since your review. */}
          <a
            href={`${pr.url}/files`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] leading-normal text-accent underline underline-offset-2 hover:brightness-110"
          >
            See new commits
          </a>
        </div>
      ) : (
        <span className="shrink-0 text-xs text-muted">No changes since</span>
      )}
    </div>
  );
}
