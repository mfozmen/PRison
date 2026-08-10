import React from "react";

export interface PrListProps<T> {
  title: string;
  items: T[];
  emptyMessage: string;
  renderRow: (item: T) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string | number;
  groupBy?: (item: T) => string;
  groupKeys?: (item: T) => string[];
  groupHref?: (key: string) => string | undefined;
  countAccent?: "success" | "warning" | "danger";
}

const countAccentClasses: Record<"success" | "warning" | "danger", string> = {
  success: "rounded-full bg-success px-2 py-0.5 font-mono text-xs tabular-nums text-background ring-1 ring-inset ring-success font-semibold",
  warning: "rounded-full bg-warning px-2 py-0.5 font-mono text-xs tabular-nums text-background ring-1 ring-inset ring-warning font-semibold",
  danger:  "rounded-full bg-danger  px-2 py-0.5 font-mono text-xs tabular-nums text-background ring-1 ring-inset ring-danger  font-semibold",
};
const neutralBadge = "rounded-full bg-border px-2 py-0.5 font-mono text-xs tabular-nums text-foreground ring-1 ring-inset ring-border";

export function PrList<T>({
  title,
  items,
  emptyMessage,
  renderRow,
  keyExtractor = (_item, i) => i,
  groupBy,
  groupKeys,
  groupHref,
  countAccent,
}: PrListProps<T>) {
  // Build ordered groups when groupBy or groupKeys is provided. groupKeys takes
  // precedence and supports one-to-many placement (an item may appear in
  // multiple groups). Each entry retains the item's original index so default
  // keys stay unique across the full list.
  const groups: Array<{ key: string; entries: Array<{ item: T; index: number }> }> =
    React.useMemo(() => {
      if (groupKeys) {
        const map = new Map<string, Array<{ item: T; index: number }>>();
        items.forEach((item, index) => {
          const keys = Array.from(new Set(groupKeys(item)));
          keys.forEach((key) => {
            if (!map.has(key)) {
              map.set(key, []);
            }
            map.get(key)!.push({ item, index });
          });
        });
        // Sort: count descending, then alphabetical (A-Z) as tie-break.
        const sortedKeys = Array.from(map.keys()).sort((a, b) => {
          const countDiff = map.get(b)!.length - map.get(a)!.length;
          if (countDiff !== 0) return countDiff;
          return a.localeCompare(b);
        });
        return sortedKeys.map((key) => ({ key, entries: map.get(key)! }));
      }
      if (!groupBy) return [];
      const order: string[] = [];
      const map = new Map<string, Array<{ item: T; index: number }>>();
      items.forEach((item, index) => {
        const key = groupBy(item);
        if (!map.has(key)) {
          order.push(key);
          map.set(key, []);
        }
        map.get(key)!.push({ item, index });
      });
      return order.map((key) => ({ key, entries: map.get(key)! }));
    }, [items, groupBy, groupKeys]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {title}
        </h2>
        <span
          data-testid="count-badge"
          className={
            countAccent && items.length > 0 ? countAccentClasses[countAccent] : neutralBadge
          }
        >
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-background/40 px-4 py-6 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (groupBy || groupKeys) ? (
        <div className="flex flex-col">
          {groups.map(({ key, entries }) => (
            <PrGroup
              key={key}
              groupKey={key}
              count={entries.length}
              href={groupHref?.(key)}
            >
              {entries.map(({ item, index }) => (
                <li key={keyExtractor(item, index)}>{renderRow(item)}</li>
              ))}
            </PrGroup>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={keyExtractor(item, i)}>{renderRow(item)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// One group, owning its own fold.
//
// The fold lives here rather than in a set of keys upstairs so that React's own
// reconciliation does the forgetting: this element is keyed by the group key, so
// a group that stops existing unmounts and takes its fold with it. That matters
// because the alternative is a trap — fold acme/api away, its last stuck PR
// clears, a new one lands tomorrow, and the group comes back already folded,
// hiding work nobody chose to hide. It is also what keeps the two grouping modes
// out of each other's namespace: switching repo <-> check replaces every key, so
// every group is new and open.
//
// Not localStorage, for the same reason: this is a "not right now" gesture, not a
// preference. It survives polls, which re-render rather than remount, and that is
// the span that matters.
function PrGroup({
  groupKey,
  count,
  href,
  children,
}: {
  groupKey: string;
  count: number;
  href?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  const panelId = React.useId();
  return (
    <div>
      <div
        className="mt-4 mb-1 flex items-center gap-2"
        data-testid="group-header"
      >
        {/* The name and the count sit inside the toggle so the target
            is the width of the header rather than a 12px chevron. The
            GitHub link cannot: an anchor inside a button is invalid,
            and it has its own job, so it follows as its own control. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[32px] cursor-pointer items-center gap-2 rounded-md text-left transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg
            aria-hidden="true"
            className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M4 2.5 8 6l-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-muted text-xs font-medium uppercase tracking-wide">
            {groupKey}
          </span>
          <span className="rounded-full bg-border px-2 py-0.5 font-mono text-xs tabular-nums text-foreground ring-1 ring-inset ring-border">
            {count}
          </span>
        </button>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${groupKey} on GitHub`}
            className="shrink-0 text-muted hover:text-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            <svg
              aria-hidden="true"
              className="block shrink-0"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3.5 3H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8.5M7 1h4m0 0v4m0-4L5 7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        )}
      </div>
      {/* Unmounted rather than hidden: a collapsed group's rows are
          not "on screen but invisible", and leaving them in the tree
          would keep them reachable by find-in-page and by every count
          that walks the DOM. */}
      {open && (
        <ul id={panelId} className="flex flex-col gap-2">
          {children}
        </ul>
      )}
    </div>
  );
}
