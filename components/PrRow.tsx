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
}

export function PrRow({ title, repo, number, url, since, now, detail, suggestion }: PrRowProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-800/50 p-4 transition-colors hover:border-slate-700 hover:bg-slate-800">
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-slate-100">{title}</span>
        <AgeBadge since={since} now={now} />
      </div>
      <span className="font-mono text-xs text-slate-400">
        {repo} #{number}
      </span>
      {detail && <div className="mt-1 text-sm text-slate-400">{detail}</div>}
      <div className="mt-3 flex items-center gap-4">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-green-500 px-3 py-1 text-xs font-semibold text-slate-950 transition-colors hover:bg-green-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Open PR
        </a>
        <a
          href={suggestion.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-400 underline decoration-slate-600 underline-offset-2 transition-colors hover:text-green-400 hover:decoration-green-400"
        >
          {suggestion.text}
        </a>
      </div>
    </div>
  );
}
