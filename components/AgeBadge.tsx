import { ageBucket } from "@/lib/prioritize";

const COLORS = {
  fresh: "bg-green-500/15 text-green-400 ring-green-500/30",
  warning: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  urgent: "bg-red-500/15 text-red-400 ring-red-500/30",
} as const;

function label(since: string, now: Date): string {
  const m = Math.floor((now.getTime() - new Date(since).getTime()) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export function AgeBadge({ since, now }: { since: string; now: Date }) {
  const bucket = ageBucket(since, now);
  return (
    <span
      data-bucket={bucket}
      className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs tabular-nums ring-1 ring-inset ${COLORS[bucket]}`}
    >
      {label(since, now)}
    </span>
  );
}
