// How long a piece of work on the board is likely to take, roughly. Only a
// review has something to measure — its diff — so only a review's estimate is
// shown; the rest are fixed guesses used when the Next move is asked to fit a
// time budget, and say so by never appearing on screen.

/** The steps an estimate is rounded to, so "~13 min" never pretends to precision. */
const STEPS = [2, 5, 10, 15, 25, 40, 60, 90, 120];

export type Size = { additions?: number; deletions?: number; changedFiles?: number };

/** Minutes to review a diff: a couple to open it, a line every four seconds or
 * so, a minute per file to find your way around. Null when GitHub sent no size. */
export function reviewMinutes(size: Size): number | null {
  if (size.additions === undefined && size.deletions === undefined && size.changedFiles === undefined) {
    return null;
  }
  const lines = (size.additions ?? 0) + (size.deletions ?? 0);
  const raw = 2 + lines / 15 + (size.changedFiles ?? 0);
  return STEPS.find((s) => raw <= s) ?? STEPS.at(-1)!;
}

/** "~10 min", "~1 h", "~2 h+". */
export function minutesLabel(minutes: number): string {
  if (minutes >= 120) return "~2 h+";
  if (minutes > 60) return "~1.5 h";
  if (minutes === 60) return "~1 h";
  return `~${minutes} min`;
}

/** Green, amber or red: small, medium, large. */
export function sizeTone(minutes: number): "success" | "warning" | "danger" {
  if (minutes <= 10) return "success";
  return minutes <= 30 ? "warning" : "danger";
}

// Fixed guesses for the queues with no diff to read: a reply, a merge, and a
// stuck PR, where a conflict is the slow kind and a red check is often a re-run.
export const REPLY_MINUTES = 5;
export const MERGE_MINUTES = 2;
export function stuckMinutes(pr: { mergeState: string; failingChecks: number }): number {
  if (pr.mergeState === "DIRTY") return 25;
  return pr.failingChecks > 0 ? 5 : 15;
}

/** The choices the Next move offers; null is "Any", today's behaviour. */
export const TIME_BUDGETS = [5, 15, 60, null] as const;
export type TimeBudget = (typeof TIME_BUDGETS)[number];

export function budgetLabel(b: TimeBudget): string {
  if (b === null) return "Any";
  return b >= 60 ? "1 hour" : `${b} min`;
}
