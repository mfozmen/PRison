import React from "react";
import { AgeBadge } from "./AgeBadge";
import type { Suggestion } from "@/lib/suggest";

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
  accent?: "success" | "warning" | "danger";
  // Clamp the title to two lines. Off by default: PR titles are short and must
  // stay fully readable. On for comment previews, which are prose and would
  // otherwise stretch the row to an unbounded height.
  clampTitle?: boolean;
}

const accentClasses: Record<"success" | "warning" | "danger", string> = {
  success: "border-l-2 border-l-success hover:border-l-success",
  warning: "border-l-2 border-l-warning hover:border-l-warning",
  danger:  "border-l-2 border-l-danger  hover:border-l-danger",
};

export function PrRow({ title, repo, number, url, since, now, detail, suggestion, draft, accent, clampTitle }: PrRowProps) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg border border-border bg-surface/50 p-4 transition-colors hover:border-border/70 hover:bg-surface${accent ? ` ${accentClasses[accent]}` : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {draft && (
            <span className="shrink-0 mt-0.5 bg-surface text-foreground ring-1 ring-inset ring-border rounded px-1.5 py-0.5 text-xs font-medium">
              Draft
            </span>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${title} on GitHub`}
            className={`${clampTitle ? "line-clamp-2 " : ""}font-medium text-foreground hover:text-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm`}
          >
            {title}
            <svg aria-hidden="true" className="inline-block ml-1 -mt-0.5 shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3.5 3H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8.5M7 1h4m0 0v4m0-4L5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
        <AgeBadge since={since} now={now} />
      </div>
      <span className="font-mono text-xs text-muted">
        {repo} #{number}
      </span>
      {detail && <div className="mt-1 text-sm text-muted">{detail}</div>}
      <a
        href={suggestion.href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 text-xs text-muted underline decoration-border underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
      >
        {suggestion.text}
      </a>
    </div>
  );
}
