import React from "react";

export interface PrListProps<T> {
  title: string;
  items: T[];
  emptyMessage: string;
  renderRow: (item: T) => React.ReactNode;
}

export function PrList<T>({ title, items, emptyMessage, renderRow }: PrListProps<T>) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={i}>{renderRow(item)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
