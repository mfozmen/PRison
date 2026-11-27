import type { ReactNode } from "react";
import { summarize, summarizeMerged, waitShort, type MergedFact, type ReviewFact } from "@/lib/week";

// The weekly look back, in History, one card per side of the board: your
// reviewing of teammates' PRs, and how your own PRs went. A mirror, not a
// score: no streaks, nothing about anyone else. The week (this or last) is
// picked once for both, in the History header.

type Tile = { n: string; label: string; sub?: string; href?: string; tone?: "warning" };

function Card({ id, title, note, children }: { id: string; title: string; note: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[20px] border border-border bg-surface p-6">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id={id} className="text-lg font-bold text-foreground">{title}</h3>
        <span className="text-[13px] text-muted">{note}</span>
      </div>
      {children}
    </section>
  );
}

function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-[14px] border border-border bg-background px-4 py-3.5">
          <div className={`text-[32px] font-bold leading-none tracking-[-0.03em] ${t.tone === "warning" ? "text-warning" : "text-foreground"}`}>{t.n}</div>
          <div className="mt-1.5 text-[13px] text-foreground">{t.label}</div>
          {t.sub &&
            (t.href ? (
              <a href={t.href} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all font-mono text-xs text-warning hover:underline">
                {t.sub}
              </a>
            ) : (
              <div className="mt-1 text-xs text-muted">{t.sub}</div>
            ))}
        </div>
      ))}
    </div>
  );
}

function DayBars({ label, perDay, dayLabels }: { label: string; perDay: number[]; dayLabels: string[] }) {
  const max = Math.max(1, ...perDay);
  return (
    <>
      <div className="mt-5 text-[13px] text-muted">{label}</div>
      {/* A picture of the numbers in the list below it, so it is hidden from
          screen readers and the list carries the same facts as text. */}
      <div aria-hidden="true" className="mt-2 flex h-24 items-end gap-3 border-b border-border px-1">
        {perDay.map((n, i) => (
          <div key={i} className="flex flex-1 justify-center">
            <span className="w-4 rounded-t bg-accent" style={{ height: `${(n / max) * 88}px` }} />
          </div>
        ))}
      </div>
      <ul className="flex gap-3 px-1 pt-1.5">
        {perDay.map((n, i) => (
          <li key={i} className="flex-1 text-center text-xs text-muted">
            <span className="sr-only">{n} on </span>
            {dayLabels[i]}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Loading, failed, or nothing in either week: one plain sentence instead of a
 * grid of zeros that reads like a broken card. */
function State({ error, loading, empty, what }: { error: boolean; loading: boolean; empty: boolean; what: string }) {
  if (error) return <p className="text-sm text-muted">Couldn&apos;t load your {what} for the week. It tries again on the next visit.</p>;
  if (loading) return <p className="text-sm text-muted">Loading the week…</p>;
  if (empty) return <p className="text-sm text-muted">No {what} in the last two weeks.</p>;
  return null;
}

const vs = (now: number, before: number) =>
  now === before ? "same as the week before" : `${Math.abs(now - before)} ${now > before ? "more" : "fewer"} than the week before`;

export function WeekCard({ facts, now, error, offset }: { facts: ReviewFact[] | null; now: Date; error: boolean; offset: 0 | 1 }) {
  const week = summarize(facts ?? [], now, offset);
  const before = summarize(facts ?? [], now, offset + 1);
  // "was 9h the week before": the comparison says which way, without a grade.
  const vsMedian =
    week.medianWaitMs !== null && before.medianWaitMs !== null ? `was ${waitShort(before.medianWaitMs)} the week before` : "";
  return (
    <Card id="week-reviewing-heading" title="Your reviewing" note="teammates' PRs you reviewed">
      {error || facts === null || facts.length === 0 ? (
        <State error={error} loading={facts === null} empty={facts?.length === 0} what="reviews" />
      ) : (
        <>
          <Tiles
            tiles={[
              { n: week.medianWaitMs === null ? "—" : waitShort(week.medianWaitMs), label: "median wait before your review", sub: vsMedian },
              { n: String(week.reviews), label: "reviews you gave", sub: vs(week.reviews, before.reviews) },
              { n: String(week.prs), label: "PRs you reviewed" },
              {
                n: week.longest?.waitedMs ? waitShort(week.longest.waitedMs) : "—",
                label: "longest you kept someone waiting",
                sub: week.longest ? `${week.longest.repo} #${week.longest.number} · @${week.longest.author}` : "",
                href: week.longest?.url,
              },
            ]}
          />
          <DayBars label="Reviews you gave, each day" perDay={week.perDay} dayLabels={week.dayLabels} />
        </>
      )}
    </Card>
  );
}

export function MergedCard({ facts, now, error, offset }: { facts: MergedFact[] | null; now: Date; error: boolean; offset: 0 | 1 }) {
  const week = summarizeMerged(facts ?? [], now, offset);
  const before = summarizeMerged(facts ?? [], now, offset + 1);
  const first = week.unreviewed[0];
  return (
    <Card id="week-merged-heading" title="Your merged PRs" note="how long your PRs took, and who looked">
      {error || facts === null || facts.length === 0 ? (
        <State error={error} loading={facts === null} empty={facts?.length === 0} what="merged PRs" />
      ) : (
        <>
          <Tiles
            tiles={[
              { n: String(week.merged), label: "PRs you merged", sub: vs(week.merged, before.merged) },
              { n: week.medianToMergeMs === null ? "—" : waitShort(week.medianToMergeMs), label: "median from open to merge" },
              { n: week.medianFirstReviewMs === null ? "—" : waitShort(week.medianFirstReviewMs), label: "median wait for a first review" },
              {
                n: String(week.unreviewed.length),
                label: "merged with no review",
                tone: week.unreviewed.length > 0 ? "warning" : undefined,
                sub: first ? `${first.repo} #${first.number}${week.unreviewed.length > 1 ? ` +${week.unreviewed.length - 1}` : ""}` : "",
                href: first?.url,
              },
            ]}
          />
          <DayBars label="PRs you merged, each day" perDay={week.perDay} dayLabels={week.dayLabels} />
        </>
      )}
    </Card>
  );
}
