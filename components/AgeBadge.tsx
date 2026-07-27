import { ageBucket, relativeAge } from "@/lib/prioritize";

const COLORS = {
  fresh: "bg-success/15 text-success ring-success/30",
  warning: "bg-warning/15 text-warning ring-warning/30",
  urgent: "bg-danger/15 text-danger ring-danger/30",
} as const;

export function AgeBadge({ since, now }: { since: string; now: Date }) {
  const bucket = ageBucket(since, now);
  return (
    <span
      data-bucket={bucket}
      className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs tabular-nums ring-1 ring-inset ${COLORS[bucket]}`}
    >
      {relativeAge(since, now)}
    </span>
  );
}
