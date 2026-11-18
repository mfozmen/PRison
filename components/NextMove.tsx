import type { ReactNode } from "react";
import { relativeAge } from "@/lib/prioritize";
import type { Suggestion } from "@/lib/suggest";
import type { Tone } from "./PrList";

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
  /** Why it is stuck, in a few words: failing checks, a conflict, a verdict. */
  reasons?: string[];
}

const RING: Record<Tone, string> = {
  danger: "border-danger shadow-[0_0_0_4px_color-mix(in_srgb,var(--danger)_10%,transparent),0_24px_64px_-20px_color-mix(in_srgb,var(--danger)_35%,transparent)]",
  warning: "border-warning shadow-[0_0_0_4px_color-mix(in_srgb,var(--warning)_10%,transparent),0_24px_64px_-20px_color-mix(in_srgb,var(--warning)_35%,transparent)]",
  success: "border-success shadow-[0_0_0_4px_color-mix(in_srgb,var(--success)_10%,transparent),0_24px_64px_-20px_color-mix(in_srgb,var(--success)_35%,transparent)]",
  accent: "border-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_10%,transparent),0_24px_64px_-20px_color-mix(in_srgb,var(--accent)_35%,transparent)]",
};
// A breath of the item's own colour in the strip, the same mix the column it
// points at uses for its highlight.
const GROUND: Record<Tone, string> = {
  danger: "bg-[color-mix(in_srgb,var(--danger)_4%,var(--surface))]",
  warning: "bg-[color-mix(in_srgb,var(--warning)_4%,var(--surface))]",
  success: "bg-[color-mix(in_srgb,var(--success)_4%,var(--surface))]",
  accent: "bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface))]",
};
const BADGE: Record<Tone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
  accent: "bg-accent",
};
const TEXT: Record<Tone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  accent: "text-accent",
};

// The single thing to do first: the longest wait across the four queues. It is
// a pointer into the columns below, not a fifth list — the same item still sits
// in its column, marked, so nothing disappears from where it belongs.
export function NextMove({
  item,
  now,
  onSkip,
  canSkip,
}: {
  item: NextMoveItem;
  now: Date;
  onSkip: () => void;
  canSkip: boolean;
}): ReactNode {
  const tone = TEXT[item.tone];
  return (
    <section
      aria-label="Next move"
      className={`flex flex-wrap items-center gap-5 rounded-[20px] border px-6 py-5 ${GROUND[item.tone]} ${RING[item.tone]}`}
    >
      <span className={`rounded-full px-2.5 py-[5px] text-[11px] font-bold leading-[normal] tracking-[0.1em] text-background ${BADGE[item.tone]}`}>
        NEXT MOVE
      </span>
      <div className="min-w-0 flex-[999_1_420px]">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
        >
          {item.title}
        </a>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
          <span>
            {item.repo} #{item.number} · waited{" "}
            <span className={`font-medium ${tone}`}>{relativeAge(item.since, now)}</span>
            {item.reasons?.length ? " ·" : ""}
          </span>
          {/* Check names stay mono like everywhere else; prose reasons do not. */}
          {item.reasons?.map((r) => (
            <span key={r} className={`${tone} ${r.startsWith("✗") ? "" : "font-sans"}`}>
              {r}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={item.suggestion.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[44px] items-center rounded-xl bg-foreground px-[18px] text-sm font-semibold text-background transition hover:brightness-[var(--hover-brightness)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
    </section>
  );
}
