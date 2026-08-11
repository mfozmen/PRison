import { relativeAge } from "@/lib/prioritize";

/**
 * The earliest of the timestamps given, or null when none are present.
 *
 * Compares the ISO strings rather than parsing them: GitHub returns one format
 * with one zone, so lexical order is chronological order, and the codebase
 * already leans on that elsewhere.
 */
export function oldestOf(...times: Array<string | undefined>): string | null {
  const present = times.filter((t): t is string => Boolean(t));
  if (present.length === 0) return null;
  return present.reduce((a, b) => (a < b ? a : b));
}

/**
 * How bad it is right now, above the lists rather than inside them.
 *
 * Every number here is a count of a list already on the page — nothing is
 * fetched for this row. The counts must come from the *visible* lists, or a
 * tile would contradict the list directly beneath it the moment a filter hides
 * something.
 *
 * "Ready to merge" is deliberately absent: it is the one list that is good
 * news, and a queue you want to be long does not belong in a row that reads as
 * a warning.
 */
export function SummaryTiles({
  waiting,
  stuck,
  replies,
  oldest,
  now,
}: {
  waiting: number;
  stuck: number;
  replies: number;
  oldest: string | null;
  now: Date;
}) {
  // Danger and warning go to the two tiles where somebody else is held up by
  // you. Stuck-on-checks is your own PR waiting on a machine, and the longest
  // wait is a fact about the others rather than a fourth queue, so both stay
  // neutral — colouring everything would colour nothing.
  const tiles = [
    { label: "Waiting on you", value: waiting, tone: "text-danger" },
    { label: "Awaiting your reply", value: replies, tone: "text-warning" },
    { label: "Stuck on checks", value: stuck, tone: "text-foreground" },
    {
      label: "Longest wait",
      // An em dash, not "0" — no queue is not a wait of zero.
      value: oldest ? relativeAge(oldest, now) : "—",
      tone: "text-foreground",
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map(({ label, value, tone }) => (
        <div
          key={label}
          data-testid="summary-tile"
          className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3"
        >
          <dt className="text-xs font-medium tracking-wide text-muted uppercase">
            {label}
          </dt>
          {/* Zeroes render like every other value: a row that changes width as
              counts drop is harder to read at a glance than a stable one, and
              "nothing waiting on you" is worth seeing. */}
          <dd
            className={`font-mono text-2xl leading-none font-semibold tabular-nums ${tone}`}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
