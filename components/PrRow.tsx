import React from "react";
import { ageBucket, relativeAge } from "@/lib/prioritize";
import type { Suggestion } from "@/lib/suggest";

/** What the row is waiting on — picks the status icon and its colour. */
export type RowKind = "ready" | "reply" | "review" | "fail" | "pending" | "idle";

export interface PrRowProps {
  title: string;
  repo: string;
  number: number;
  url: string;
  since: string;
  now: Date;
  detail?: React.ReactNode;
  suggestion: Suggestion;
  draft?: boolean;
  kind?: RowKind;
  /** Who it is about, first on the meta line: "@alice" on a review, the commenter on a reply. */
  byline?: string;
  /** A control pinned to the right of the title (the reply column's seen toggle). */
  aside?: React.ReactNode;
  /** This row is the one the Next move strip points at. */
  marked?: boolean;
  // Clamp the title to two lines. Off by default: PR titles are short and must
  // stay fully readable. On for comment previews, which are prose and would
  // otherwise stretch the row to an unbounded height.
  clampTitle?: boolean;
}

// An icon per state, so the column colour is never the only signal: a ✓, a
// speech bubble, an eye, a ✕ and a clock read the same in any theme and to
// anyone who cannot tell two of its colours apart.
const ICONS: Record<RowKind, { className: string; path: React.ReactNode; stroke?: string }> = {
  ready: { className: "text-success", stroke: "2.5", path: <path d="M20 6 9 17l-5-5" /> },
  reply: {
    className: "text-warning",
    path: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  },
  review: {
    className: "text-accent",
    path: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      </>
    ),
  },
  fail: { className: "text-danger", stroke: "2.5", path: <path d="M18 6 6 18M6 6l12 12" /> },
  idle: { className: "text-muted", path: <circle cx="12" cy="12" r="9" /> },
  pending: {
    className: "text-warning",
    path: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
};

// The age keeps its urgency colour but loses the box: in a column of rows a
// filled pill on every line is louder than the titles it sits under.
const AGE: Record<ReturnType<typeof ageBucket>, string> = {
  fresh: "text-muted",
  warning: "text-warning",
  urgent: "text-danger",
};

export function PrRow({ title, repo, number, url, since, now, detail, suggestion, draft, kind, byline, aside, marked, clampTitle }: PrRowProps) {
  const icon = kind ? ICONS[kind] : null;
  const bucket = ageBucket(since, now);
  return (
    <div data-kind={kind} className="flex gap-2.5 py-3">
      {icon && (
        <svg
          aria-hidden="true"
          className={`mt-0.5 shrink-0 ${icon.className}`}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={icon.stroke ?? "2"}
        >
          {icon.path}
        </svg>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${title} on GitHub`}
          className={`${clampTitle ? "line-clamp-2 before:content-['“'] after:content-['”'] " : ""}text-sm font-medium leading-[1.4] text-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm`}
        >
          {draft && (
            <span className="mr-1.5 rounded border border-border px-[5px] py-px align-[1px] text-[11px] font-semibold uppercase text-muted">
              Draft
            </span>
          )}
          {title}
        </a>
        {aside && <span className="ml-auto shrink-0">{aside}</span>}
        </div>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted">
          {byline && (
            <>
              <span>{byline}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{repo} #{number}</span>
          <span aria-hidden="true">·</span>
          <span data-bucket={bucket} className={`tabular-nums ${AGE[bucket]}`}>
            {relativeAge(since, now)}
          </span>
          {marked && (
            <span className={`font-sans text-[11px] font-semibold ${icon?.className ?? "text-accent"}`}>
              ↑ next move
            </span>
          )}
        </span>
        {detail && <div className="mt-1.5 text-sm text-muted">{detail}</div>}
        <a
          href={suggestion.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 self-start text-[13px] text-muted underline decoration-border underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
        >
          {suggestion.text}
        </a>
      </div>
    </div>
  );
}
