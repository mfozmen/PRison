import { ageBucket } from "@/lib/prioritize";

const COLORS = {
  fresh: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  urgent: "bg-red-100 text-red-800",
} as const;

function label(since: string, now: Date): string {
  const h = Math.floor((now.getTime() - new Date(since).getTime()) / 3_600_000);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export function AgeBadge({ since, now }: { since: string; now: Date }) {
  const bucket = ageBucket(since, now);
  return (
    <span data-bucket={bucket} className={`rounded px-2 py-0.5 text-xs ${COLORS[bucket]}`}>
      {label(since, now)}
    </span>
  );
}
