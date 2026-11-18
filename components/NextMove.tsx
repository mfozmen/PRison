import type { ReactNode } from "react";
import { ageBucket, relativeAge } from "@/lib/prioritize";
import type { Suggestion } from "@/lib/suggest";
import type { Tone } from "./PrList";

export interface NextMoveReason {
  label: string;
  /** Check names are set in mono like everywhere else; prose reasons are not. */
  mono?: boolean;
}

export interface NextMoveItem {
  /** Stable id, so Skip can step past it. */
  id: string;
  title: string;
  repo: string;
  number: number;
  url: string;
  since: string;
  suggestion: Suggestion;
  tone: Tone;
  /** Why it is waiting, in a few words: failing checks, a conflict, a verdict. */
  reasons?: NextMoveReason[];
}

// Which queue the item belongs to: the card's edge, label, chips and button.
const QUEUE: Record<Tone, string> = {
  danger: "Stuck on checks",
  accent: "Waiting on your review",
  warning: "Awaiting your reply",
  success: "Ready to merge",
};

// How long it has been waiting: the time block's colour, word and meter, on
// the same thresholds as every row's age.
const PACE = {
  fresh: { cls: "nm-pace-moving", word: "moving", steps: 1 },
  warning: { cls: "nm-pace-slowing", word: "slowing", steps: 2 },
  urgent: { cls: "nm-pace-stalled", word: "stalled", steps: 3 },
} as const;

// The single thing to do first: the longest wait across the four queues. It is
// a pointer into the columns below, not a fifth list — the same item still sits
// in its column, marked, so nothing disappears from where it belongs.
//
// It says two things in two places. Queue colour on the edge, label, chips and
// button: what kind of work this is. Pace colour on the time block: how far it
// has stalled, with a word and a three-step meter so colour is never the only
// signal. The surface (spot ground, aurora field, edge, glow) is in globals.css.
export function NextMove({
  item,
  now,
  position,
  total,
  onSkip,
  canSkip,
}: {
  item: NextMoveItem;
  now: Date;
  /** 1-based place of this item in the oldest-first round Skip walks. */
  position: number;
  total: number;
  onSkip: () => void;
  canSkip: boolean;
}): ReactNode {
  const pace = PACE[ageBucket(item.since, now)];
  return (
    <section
      aria-label="Next move"
      data-pace={pace.word}
      className={`nm-card nm-tone-${item.tone} ${pace.cls} flex flex-wrap overflow-hidden rounded-[20px]`}
    >
      <div className="nm-paceblock flex flex-[0_0_258px] flex-col gap-1.5 px-6 py-[22px]">
        <span className="text-[11px] font-bold leading-[normal] tracking-[0.1em]">NEXT MOVE</span>
        <span className="text-[60px] font-extrabold leading-none tracking-[-0.04em]">
          {relativeAge(item.since, now)}
        </span>
        <span className="text-xs font-bold leading-[normal]">
          {pace.word} · {position} of {total}
        </span>
        <span className="mt-1 flex gap-1" role="img" aria-label={`Pace: ${pace.word}`}>
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={`h-1 w-[18px] rounded-sm ${
                step <= pace.steps ? "bg-background" : "bg-background/30"
              }`}
            />
          ))}
        </span>
      </div>
      <div className="flex min-w-0 flex-[1_1_472px] flex-wrap items-center gap-5 px-[26px] py-[22px]">
        <div className="min-w-0 flex-[999_1_320px]">
          <div className="text-xs font-semibold leading-[normal] tracking-[0.08em] text-[var(--tone-ink)]">
            ● {QUEUE[item.tone].toUpperCase()} ·{" "}
            <span className="font-mono tracking-normal">
              {item.repo} #{item.number}
            </span>
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 block rounded-sm text-[21px] font-bold leading-tight tracking-[-0.01em] text-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {item.title}
          </a>
          {item.reasons?.length ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {item.reasons.map((r) => (
                <span
                  key={r.label}
                  className={`nm-chip rounded-md px-2 py-0.5 text-xs font-medium leading-[normal] text-[var(--tone-ink)] ${r.mono ? "font-mono" : ""}`}
                >
                  {r.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={item.suggestion.href}
            target="_blank"
            rel="noopener noreferrer"
            className="nm-cta flex min-h-[44px] items-center rounded-xl px-[18px] text-sm font-semibold transition hover:brightness-[var(--hover-brightness)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {item.suggestion.text}
          </a>
          {canSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="min-h-[44px] cursor-pointer rounded-xl px-4 text-sm font-medium text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Skip →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
