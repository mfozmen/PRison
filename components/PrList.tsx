import React from "react";

export interface PrListProps<T> {
  title: string;
  items: T[];
  emptyMessage: string;
  renderRow: (item: T) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string | number;
  groupBy?: (item: T) => string;
  groupHref?: (key: string) => string | undefined;
  accentCount?: boolean;
}

export function PrList<T>({
  title,
  items,
  emptyMessage,
  renderRow,
  keyExtractor = (_item, i) => i,
  groupBy,
  groupHref,
  accentCount = false,
}: PrListProps<T>) {
  // Build ordered groups when groupBy is provided. Each entry retains the
  // item's original index so default keys stay unique across the full list.
  const groups: Array<{ key: string; entries: Array<{ item: T; index: number }> }> =
    React.useMemo(() => {
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
    }, [items, groupBy]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </h2>
        <span
          data-testid="count-badge"
          className={
            accentCount && items.length > 0
              ? "rounded-full bg-amber-500 px-2 py-0.5 font-mono text-xs tabular-nums text-slate-950 ring-1 ring-inset ring-amber-600 font-semibold"
              : "rounded-full bg-slate-800 px-2 py-0.5 font-mono text-xs tabular-nums text-slate-400 ring-1 ring-inset ring-slate-700"
          }
        >
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-sm text-slate-400">
          {emptyMessage}
        </p>
      ) : groupBy ? (
        <div className="flex flex-col">
          {groups.map(({ key, entries }) => {
            const href = groupHref?.(key);
            return (
              <div key={key}>
                <div
                  className="mt-4 mb-1 flex items-center gap-2"
                  data-testid="group-header"
                >
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${key} on GitHub`}
                      className="text-slate-400 text-xs font-medium uppercase tracking-wide hover:text-green-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded-sm"
                    >
                      {key}
                      <svg
                        aria-hidden="true"
                        className="inline-block ml-1 -mt-0.5 shrink-0"
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
                  ) : (
                    <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                      {key}
                    </span>
                  )}
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-xs tabular-nums text-slate-400 ring-1 ring-inset ring-slate-700">
                    {entries.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {entries.map(({ item, index }) => (
                    <li key={keyExtractor(item, index)}>{renderRow(item)}</li>
                  ))}
                </ul>
              </div>
            );
          })}
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
