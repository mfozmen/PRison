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
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-slate-900">{title}</span>
        <AgeBadge since={since} now={now} />
      </div>
      <span className="font-mono text-xs text-slate-500">
        {repo} #{number}
      </span>
      {detail && <div className="mt-1 text-sm text-slate-600">{detail}</div>}
      <div className="mt-2 flex items-center gap-3">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
        >
          Open PR
        </a>
        <a
          href={suggestion.href}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-slate-500 underline hover:text-indigo-600"
        >
          {suggestion.text}
        </a>
      </div>
    </div>
  );
}
