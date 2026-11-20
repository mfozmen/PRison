// A look back at the viewer's reviewing, this week against the last: a mirror,
// not a score. Built from the reviews they submitted and, for each, how long
// the request had waited before it.

/** One review the viewer submitted. */
export type ReviewFact = {
  prId: string;
  title: string;
  url: string;
  repo: string;
  number: number;
  author: string;
  submittedAt: string;  // ISO
  waitedMs: number | null; // since the request it answered; null when there was none to date it from
};

export type WeekSummary = {
  reviews: number;          // reviews submitted
  prs: number;              // distinct PRs reviewed
  medianWaitMs: number | null;
  longest: ReviewFact | null;
  perDay: number[];         // reviews per day, oldest first, 7 entries
  dayLabels: string[];      // "Mon", "Tue", … matching perDay
};

const DAY = 86_400_000;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The seven days ending with `end` (exclusive) — weekOffset 0 is the last
 * seven days, 1 the seven before them. */
export function summarize(facts: ReviewFact[], now: Date, weekOffset = 0): WeekSummary {
  const end = now.getTime() - weekOffset * 7 * DAY;
  const start = end - 7 * DAY;
  const inWeek = facts.filter((f) => {
    const t = new Date(f.submittedAt).getTime();
    return t >= start && t < end;
  });
  const waits = inWeek.map((f) => f.waitedMs).filter((w): w is number => w !== null);
  const longest = inWeek.reduce<ReviewFact | null>(
    (best, f) => (f.waitedMs !== null && (best === null || f.waitedMs > (best.waitedMs ?? 0)) ? f : best),
    null,
  );
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const from = start + i * DAY;
    return inWeek.filter((f) => {
      const t = new Date(f.submittedAt).getTime();
      return t >= from && t < from + DAY;
    }).length;
  });
  const dayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(start + i * DAY + DAY / 2).toLocaleDateString("en-US", { weekday: "short" }),
  );
  return {
    reviews: inWeek.length,
    prs: new Set(inWeek.map((f) => f.prId)).size,
    medianWaitMs: median(waits),
    longest,
    perDay,
    dayLabels,
  };
}

/** "5h", "2d", "40m": a wait, compactly. */
export function waitShort(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}
