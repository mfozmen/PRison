import React from "react";

export interface PrListProps<T> {
  title: string;
  items: T[];
  emptyMessage: string;
  renderRow: (item: T) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string | number;
  groupBy?: (item: T) => string;
}

export function PrList<T>({
  title,
  items,
  emptyMessage,
  renderRow,
  keyExtractor = (_item, i) => i,
  groupBy,
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
        <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-xs tabular-nums text-slate-400 ring-1 ring-inset ring-slate-700">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-sm text-slate-400">
          {emptyMessage}
        </p>
      ) : groupBy ? (
        <div className="flex flex-col">
          {groups.map(({ key, entries }) => (
            <div key={key}>
              <div
                className="mt-4 mb-1 flex items-center gap-2"
                data-testid="group-header"
              >
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                  {key}
                </span>
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
