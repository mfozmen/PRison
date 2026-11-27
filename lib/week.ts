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
 * seven days, 1 the seven before them — and what fell in them, per day. */
function weekOf<T>(facts: T[], at: (f: T) => string, now: Date, weekOffset: number) {
  const end = now.getTime() - weekOffset * 7 * DAY;
  const start = end - 7 * DAY;
  const inWeek = facts.filter((f) => {
    const t = new Date(at(f)).getTime();
    return t >= start && t < end;
  });
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const from = start + i * DAY;
    return inWeek.filter((f) => {
      const t = new Date(at(f)).getTime();
      return t >= from && t < from + DAY;
    }).length;
  });
  const dayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(start + i * DAY + DAY / 2).toLocaleDateString("en-US", { weekday: "short" }),
  );
  return { inWeek, perDay, dayLabels };
}

export function summarize(facts: ReviewFact[], now: Date, weekOffset = 0): WeekSummary {
  const { inWeek, perDay, dayLabels } = weekOf(facts, (f) => f.submittedAt, now, weekOffset);
  const waits = inWeek.map((f) => f.waitedMs).filter((w): w is number => w !== null);
  const longest = inWeek.reduce<ReviewFact | null>(
    (best, f) => (f.waitedMs !== null && (best === null || f.waitedMs > (best.waitedMs ?? 0)) ? f : best),
    null,
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

/** One of the viewer's own PRs that merged. */
export type MergedFact = {
  prId: string;
  title: string;
  url: string;
  repo: string;
  number: number;
  createdAt: string;           // ISO
  mergedAt: string;            // ISO
  firstReviewAt: string | null; // the first review by anyone else; null when it merged unreviewed
};

export type MergedSummary = {
  merged: number;
  medianToMergeMs: number | null;      // opened → merged
  medianFirstReviewMs: number | null;  // opened → first review, over the reviewed ones
  unreviewed: MergedFact[];            // merged with no review from anyone else
  perDay: number[];
  dayLabels: string[];
};

const ms = (from: string, to: string) => new Date(to).getTime() - new Date(from).getTime();

export function summarizeMerged(facts: MergedFact[], now: Date, weekOffset = 0): MergedSummary {
  const { inWeek, perDay, dayLabels } = weekOf(facts, (f) => f.mergedAt, now, weekOffset);
  return {
    merged: inWeek.length,
    medianToMergeMs: median(inWeek.map((f) => ms(f.createdAt, f.mergedAt))),
    medianFirstReviewMs: median(
      inWeek.flatMap((f) => (f.firstReviewAt ? [ms(f.createdAt, f.firstReviewAt)] : [])),
    ),
    unreviewed: inWeek.filter((f) => f.firstReviewAt === null),
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
