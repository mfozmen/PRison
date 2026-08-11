import { relativeAge } from "@/lib/prioritize";

/** A queue's two facts: how many are in it, and how long the worst one has sat. */
export interface QueueSummary {
  count: number;
  /** Head of the list, which is its oldest — every list is sorted oldest-first. */
  oldest?: string;
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
  now,
}: {
  waiting: QueueSummary;
  stuck: QueueSummary;
  replies: QueueSummary;
  now: Date;
}) {
  // Danger and warning go to the two tiles where somebody else is held up by
  // you. Stuck-on-checks is your own PR waiting on a machine, so it stays
  // neutral — colouring everything would colour nothing.
  //
  // Navigation lives in the section index, not here. These three tiles were
  // links for a while, which forced a fourth control onto the row for the two
  // sections they could not cover: the tiles are a warning row, so "Ready to
  // merge" is deliberately absent and the histories never belonged. A row that
  // cannot list every section is not an index.
  //
  // Each tile carries its own age rather than there being one tile for the
  // worst age across all three. That tile existed and said "LONGEST WAIT 2d",
  // which never named the queue it was reading, so which list it described
  // changed with the data and the reader could not tell. An age belongs to the
  // queue it came from.
  const tiles = [
    { label: "Waiting on you", queue: waiting, tone: "text-danger" },
    { label: "Awaiting your reply", queue: replies, tone: "text-warning" },
    { label: "Stuck on checks", queue: stuck, tone: "text-foreground" },
  ];

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tiles.map(({ label, queue, tone }) => (
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
            className={`flex items-baseline gap-2 font-mono text-2xl leading-none font-semibold tabular-nums ${tone}`}
          >
            {queue.count}
            {/* An empty queue has no oldest, and "oldest —" would be noise
                  where the 0 above has already said everything. */}
            {queue.oldest && (
              <span className="font-sans text-xs font-normal text-muted">
                oldest {relativeAge(queue.oldest, now)}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
