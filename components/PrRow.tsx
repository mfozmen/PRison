import React from "react";
import { ageBucket, relativeAge } from "@/lib/prioritize";
import type { Suggestion } from "@/lib/suggest";
import type { LimitState } from "@/lib/limits";

/** What the row is waiting on — picks the status icon and its colour. */
export type RowKind = "ready" | "reply" | "review" | "fail" | "pending" | "idle" | "others";

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
  /** Where it stands against the user's wait limit for its queue, if any. */
  limit?: LimitState | null;
  /** Who approves it now. Omitted on rows that are not the viewer's own PRs. */
  approvedBy?: string[];
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
  // An hourglass: the PR is waiting on somebody else, not on you.
  others: {
    className: "text-accent",
    path: <path d="M6 2h12M6 22h12M7 2c0 6 10 6 10 10S7 16 7 22M17 2c0 6-10 6-10 10s10 4 10 10" />,
  },
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

// The limit's colours: quiet while there is time, amber when due, red when late.
const LIMIT_BAR = { ok: "bg-success", due: "bg-warning", late: "bg-danger" } as const;
const LIMIT_CHIP = { ok: "", due: "bg-warning/15 text-warning", late: "bg-danger/15 text-danger" } as const;

export function PrRow({ title, repo, number, url, since, now, detail, suggestion, draft, kind, byline, aside, marked, clampTitle, limit, approvedBy }: PrRowProps) {
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
        {approvedBy && (
          <span className={`mt-1 flex flex-wrap items-center gap-1 text-xs ${approvedBy.length ? "text-success" : "text-muted"}`}>
            {approvedBy.length ? (
              <>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Approved by
                <span className="break-all font-mono">{approvedBy.map((l) => `@${l}`).join(", ")}</span>
              </>
            ) : (
              "No approvals yet"
            )}
          </span>
        )}
        {detail && <div className="mt-1.5 text-sm text-muted">{detail}</div>}
        {limit?.label && (
          <span className={`mt-1.5 self-start rounded-md px-2 py-0.5 text-xs font-semibold leading-[normal] ${LIMIT_CHIP[limit.state]}`}>
            {limit.label}
          </span>
        )}
        <a
          href={suggestion.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 self-start text-[13px] text-muted underline decoration-border underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
        >
          {suggestion.text}
        </a>
        {limit && (
          // The words are in the chip above; the bar is the at-a-glance half.
          <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-sm bg-border">
            <div className={`h-full ${LIMIT_BAR[limit.state]}`} style={{ width: `${limit.pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
