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
  //
  // Three of the four tiles name a list further down the page, so each is also
  // the way to it — the count you just read is the reason you want to go. The
  // link is the label, stretched over the whole tile by the ::after below, so
  // the target is the tile rather than a line of 11px text. "Longest wait"
  // stays inert: it describes whichever of the three is worst, and a link that
  // lands somewhere different depending on the data is a worse link than none.
  const tiles = [
    {
      label: "Waiting on you",
      value: waiting,
      tone: "text-danger",
      href: "#waiting-on-your-review",
    },
    {
      label: "Awaiting your reply",
      value: replies,
      tone: "text-warning",
      href: "#comments-awaiting-reply",
    },
    {
      label: "Stuck on checks",
      value: stuck,
      tone: "text-foreground",
      href: "#stuck-on-checks",
    },
    {
      label: "Longest wait",
      // An em dash, not "0" — no queue is not a wait of zero.
      value: oldest ? relativeAge(oldest, now) : "—",
      tone: "text-foreground",
      href: undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ label, value, tone, href }) => (
          <div
            key={label}
            data-testid="summary-tile"
            className={`relative flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3 ${href ? "transition-colors hover:border-accent focus-within:border-accent" : ""}`}
          >
            <dt className="text-xs font-medium tracking-wide text-muted uppercase">
              {href ? (
                <a
                  href={href}
                  className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {label}
                </a>
              ) : (
                label
              )}
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
      {/* One control, not a second row of chrome: both histories share a row at
          the foot of the board, so one anchor at that row reaches both. They
          are the sections the tiles cannot cover — Ready to merge is already at
          the top, and neither archive is a queue worth a tile of its own. */}
      <a
        href="#archives"
        className="self-end rounded-sm text-xs font-medium text-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Jump to archives ↓
      </a>
    </div>
  );
}
