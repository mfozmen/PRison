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
  accent?: "blocking";
}

export function PrRow({ title, repo, number, url, since, now, detail, suggestion, draft, accent }: PrRowProps) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-800/50 p-4 transition-colors hover:border-slate-700 hover:bg-slate-800${accent === "blocking" ? " border-l-2 border-l-amber-500" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {draft && (
            <span className="shrink-0 mt-0.5 bg-slate-700 text-slate-300 ring-1 ring-inset ring-slate-600 rounded px-1.5 py-0.5 text-xs font-medium">
              Draft
            </span>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${title} on GitHub`}
            className="font-medium text-slate-100 hover:text-green-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded-sm"
          >
            {title}
            <svg aria-hidden="true" className="inline-block ml-1 -mt-0.5 shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3.5 3H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8.5M7 1h4m0 0v4m0-4L5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
        <AgeBadge since={since} now={now} />
      </div>
      <span className="font-mono text-xs text-slate-400">
        {repo} #{number}
      </span>
      {detail && <div className="mt-1 text-sm text-slate-400">{detail}</div>}
      <a
        href={suggestion.href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 text-xs text-slate-400 underline decoration-slate-600 underline-offset-2 transition-colors hover:text-green-400 hover:decoration-green-400"
      >
        {suggestion.text}
      </a>
    </div>
  );
}
