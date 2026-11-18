import React from "react";
import { DisclosureHeader } from "./DisclosureHeader";

export interface PrListProps<T> {
  title: string;
  items: T[];
  emptyMessage: string;
  renderRow: (item: T) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string | number;
  groupBy?: (item: T) => string;
  groupKeys?: (item: T) => string[];
  groupHref?: (key: string) => string | undefined;
  /** The column's status colour: its dot, and its border when highlighted. */
  tone?: Tone;
  /** One line under the count saying what the queue is. */
  description?: string;
  /** What the count counts ("PRs", "threads") and the head's age, e.g. "oldest 4d". */
  caption?: string;
  /** The column that holds the Next move item. */
  highlighted?: boolean;
  /** Anchor target for the jump links above. */
  id?: string;
}

export type Tone = "success" | "warning" | "danger" | "accent";

// Spelled out rather than built from the tone, because Tailwind only ships the
// classes it can find written down.
const DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
};
// The highlighted column: its tone in the border, a breath of it in the card,
// and in the label, so it reads as "this one" before any title is read.
const HIGHLIGHT: Record<Tone, string> = {
  success: "border-success/40 bg-[color-mix(in_srgb,var(--success)_4%,var(--surface))]",
  warning: "border-warning/40 bg-[color-mix(in_srgb,var(--warning)_4%,var(--surface))]",
  danger: "border-danger/40 bg-[color-mix(in_srgb,var(--danger)_4%,var(--surface))]",
  accent: "border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface))]",
};
const LABEL: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  accent: "text-accent",
};

export function PrList<T>({
  title,
  items,
  emptyMessage,
  renderRow,
  keyExtractor = (_item, i) => i,
  groupBy,
  groupKeys,
  groupHref,
  tone,
  description,
  caption,
  highlighted,
  id,
}: PrListProps<T>) {
  // Open, and component state only — never localStorage.
  //
  // These four sections are the product, so a fold that outlived the sitting
  // would be the one bug this dashboard cannot afford: you would open it in the
  // morning to a board silently missing the five PRs waiting on your review,
  // with no memory that you were the one who hid them. Folding is a "not right
  // now" gesture. It survives a refresh anyway, since a poll re-renders rather
  // than remounts, and that is the span worth keeping.
  //
  // The count stays on the header while folded, so nothing about "there are 6
  // of these" is ever hidden — only the rows are.
  const [open, setOpen] = React.useState(true);
  const bodyId = React.useId();

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
    // tabIndex makes the section a focus target, which is what turns a jump
    // link into a real one: the browser moves the caret here too, so the next
    // Tab continues inside the section instead of back at the top of the page.
    // scroll-mt keeps the header off the very edge of the viewport.
    <section
      id={id}
      tabIndex={-1}
      data-highlighted={highlighted || undefined}
      className={`flex scroll-mt-4 flex-col gap-4 rounded-[20px] border p-6 focus:outline-none ${
        highlighted && tone ? HIGHLIGHT[tone] : "border-border bg-surface"
      }`}
    >
      <DisclosureHeader
        open={open}
        onToggle={() => setOpen((v) => !v)}
        title={title}
        controls={bodyId}
        titleClassName={highlighted && tone ? LABEL[tone] : undefined}
        leading={tone && <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} />}
      />
      <div className="-mt-2 flex items-baseline gap-2">
        <span
          data-testid="count-badge"
          className="text-[56px] font-bold leading-none tracking-[-0.04em] text-foreground"
        >
          {items.length}
        </span>
        {caption && <span className="text-sm text-muted">{caption}</span>}
      </div>
      {description && <p className="text-sm leading-normal text-muted">{description}</p>}
      {open && (
        <div id={bodyId} className="flex flex-col">
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
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
            <ul className="flex flex-col divide-y divide-border border-t border-border">
              {items.map((item, i) => (
                <li key={keyExtractor(item, i)}>{renderRow(item)}</li>
              ))}
            </ul>
          )}
        </div>
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
        <ul id={panelId} className="flex flex-col divide-y divide-border border-t border-border">
          {children}
        </ul>
      )}
    </div>
  );
}
