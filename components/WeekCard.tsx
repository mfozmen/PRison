import { useState } from "react";
import { summarize, waitShort, type ReviewFact } from "@/lib/week";

// The weekly look back, in History: how long people waited for your review,
// how much you reviewed, and the one wait that ran longest — this week against
// the last. A mirror, not a score: no streaks, nothing about anyone else.
export function WeekCard({ facts, now, error }: { facts: ReviewFact[] | null; now: Date; error: boolean }) {
  const [offset, setOffset] = useState<0 | 1>(0);
  const week = summarize(facts ?? [], now, offset);
  const before = summarize(facts ?? [], now, offset + 1);
  const max = Math.max(1, ...week.perDay);

  // "was 9h the week before": the comparison says which way, without a grade.
  const vsMedian =
    week.medianWaitMs !== null && before.medianWaitMs !== null
      ? `was ${waitShort(before.medianWaitMs)} the week before`
      : "";
  const vsReviews =
    week.reviews === before.reviews
      ? "same as the week before"
      : `${Math.abs(week.reviews - before.reviews)} ${week.reviews > before.reviews ? "more" : "fewer"} than the week before`;

  const tiles = [
    { n: week.medianWaitMs === null ? "—" : waitShort(week.medianWaitMs), label: "median wait before your review", sub: vsMedian },
    { n: String(week.reviews), label: "reviews you gave", sub: vsReviews },
    { n: String(week.prs), label: "PRs you reviewed", sub: "" },
    {
      n: week.longest?.waitedMs ? waitShort(week.longest.waitedMs) : "—",
      label: "longest you kept someone waiting",
      sub: week.longest ? `${week.longest.repo} #${week.longest.number} · @${week.longest.author}` : "",
      href: week.longest?.url,
    },
  ];

  return (
    <section aria-labelledby="week-heading" className="rounded-[20px] border border-border bg-surface p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 id="week-heading" className="text-lg font-bold text-foreground">
          {offset === 0 ? "This week" : "Last week"}
        </h3>
        <span className="text-[13px] text-muted">your reviewing, the last seven days against the seven before</span>
        <span className="flex-1" />
        <div role="group" aria-label="Which week" className="flex rounded-full border border-border bg-background p-[3px]">
          {(["This week", "Last week"] as const).map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={offset === i}
              onClick={() => setOffset(i as 0 | 1)}
              className={`min-h-7 cursor-pointer rounded-full px-3 text-xs focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                offset === i ? "bg-foreground font-semibold text-background" : "font-medium text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="text-sm text-muted">Couldn&apos;t load your reviews for the week. It tries again on the next visit.</p>
      ) : facts === null ? (
        <p className="text-sm text-muted">Loading the week…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-[14px] border border-border bg-background px-4 py-3.5">
                <div className="text-[32px] font-bold leading-none tracking-[-0.03em] text-foreground">{t.n}</div>
                <div className="mt-1.5 text-[13px] text-foreground">{t.label}</div>
                {t.sub &&
                  (t.href ? (
                    <a href={t.href} target="_blank" rel="noopener noreferrer" className="mt-1 block font-mono text-xs text-warning hover:underline">
                      {t.sub}
                    </a>
                  ) : (
                    <div className="mt-1 text-xs text-muted">{t.sub}</div>
                  ))}
              </div>
            ))}
          </div>
          <div className="mt-5 text-[13px] text-muted">Reviews you gave, each day</div>
          {/* A picture of the numbers in the list below it, so it is hidden from
              screen readers and the list carries the same facts as text. */}
          <div aria-hidden="true" className="mt-2 flex h-24 items-end gap-3 border-b border-border px-1">
            {week.perDay.map((n, i) => (
              <div key={i} className="flex flex-1 justify-center">
                <span className="w-4 rounded-t bg-accent" style={{ height: `${(n / max) * 88}px` }} />
              </div>
            ))}
          </div>
          <ul className="flex gap-3 px-1 pt-1.5">
            {week.perDay.map((n, i) => (
              <li key={i} className="flex-1 text-center text-xs text-muted">
                <span className="sr-only">{n} on </span>
                {week.dayLabels[i]}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
