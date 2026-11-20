import type { ReactNode } from "react";
import { ageBucket, relativeAge } from "@/lib/prioritize";
import type { Suggestion } from "@/lib/suggest";
import type { Tone } from "./PrList";
import { TIME_BUDGETS, budgetLabel, type TimeBudget } from "@/lib/estimate";

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
  /** Rough minutes it takes, used to fit a time budget. */
  minutes: number;
  /** Shown only where it was measured (a review's diff): "~10 min · 84 lines · 3 files". */
  size?: { label: string; tone: "success" | "warning" | "danger" };
}

// Which queue the item belongs to: the card's edge, label, chips and button.
const QUEUE: Record<Tone, string> = {
  danger: "Stuck on checks",
  accent: "Waiting on your review",
  warning: "Awaiting your reply",
  success: "Ready to merge",
};

// A review's size in the board's status colours: small, medium, large.
export const SIZE = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
} as const;

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
  budget = null,
  onBudget,
  fits = true,
}: {
  item: NextMoveItem;
  now: Date;
  /** 1-based place of this item in the oldest-first round Skip walks. */
  position: number;
  total: number;
  onSkip: () => void;
  canSkip: boolean;
  /** How long the user said they have; null is "Any". */
  budget?: TimeBudget;
  onBudget?: (b: TimeBudget) => void;
  /** False when nothing fits the budget and this is the longest wait instead. */
  fits?: boolean;
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
          {budget !== null && fits ? " that fit" : ""}
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
          {onBudget && (
            // How long the user has. Picks the longest wait that fits instead
            // of the longest wait, so a spare quarter hour clears something.
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-muted">I have</span>
              <div role="group" aria-label="Time you have" className="flex rounded-full border border-border bg-background/60 p-[3px]">
                {TIME_BUDGETS.map((b) => (
                  <button
                    key={String(b)}
                    type="button"
                    aria-pressed={budget === b}
                    onClick={() => onBudget(b)}
                    className={`min-h-7 cursor-pointer rounded-full px-3 text-xs focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                      budget === b ? "bg-foreground font-semibold text-background" : "font-medium text-muted hover:text-foreground"
                    }`}
                  >
                    {budgetLabel(b)}
                  </button>
                ))}
              </div>
              {budget !== null && !fits && (
                <span className="text-xs text-muted">Nothing fits that — here is the longest wait.</span>
              )}
            </div>
          )}
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
          {item.reasons?.length || item.size ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {item.size && (
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold leading-[normal] ${SIZE[item.size.tone]}`}>
                  {item.size.label}
                </span>
              )}
              {item.reasons?.map((r, i) => (
                <span
                  // Labels can repeat (two checks of one name, an author
                  // whose name is also a path), so the index keeps keys unique.
                  key={`${i}-${r.label}`}
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
