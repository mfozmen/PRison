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
  blocked?: boolean;
  accent?: "blocking";
}

export function PrRow({ title, repo, number, url, since, now, detail, suggestion, draft, blocked, accent }: PrRowProps) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg border border-border bg-surface/50 p-4 transition-colors hover:border-border/70 hover:bg-surface${accent === "blocking" ? " border-l-2 border-l-warning hover:border-l-warning" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {draft && (
            <span className="shrink-0 mt-0.5 bg-surface text-foreground ring-1 ring-inset ring-border rounded px-1.5 py-0.5 text-xs font-medium">
              Draft
            </span>
          )}
          {blocked && (
            <span
              className="shrink-0 mt-0.5 inline-flex items-center gap-1 bg-warning/10 text-warning ring-1 ring-inset ring-warning/30 rounded px-1.5 py-0.5 text-xs font-medium"
              title="GitHub is blocking this merge. Some required checks aren't visible via the API — open the PR on GitHub for the full list."
            >
              <svg aria-hidden="true" className="shrink-0" width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M3.5 4V3a1.5 1.5 0 0 1 3 0v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Blocked
            </span>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${title} on GitHub`}
            className="font-medium text-foreground hover:text-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
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
