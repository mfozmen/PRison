import { ageBucket } from "@/lib/prioritize";

const COLORS = {
  fresh: "bg-success/15 text-success ring-success/30",
  warning: "bg-warning/15 text-warning ring-warning/30",
  urgent: "bg-danger/15 text-danger ring-danger/30",
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
