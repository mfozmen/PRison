// Snooze: "not today" for one item on the board. Kept in this browser like the
// seen comments are; nothing goes to GitHub.
//
// A snooze ends on a time, or when the item changes. "Changes" is read off a
// mark the board already has for the item — a stuck PR's last push and its
// blockers, a review's request time, a thread's last comment — so a new commit,
// a re-request or a reply wakes it without asking GitHub for anything more.

export type Snooze =
  | { kind: "time"; until: string }
  | { kind: "change"; mark: string };

export type Snoozes = Record<string, Snooze>;

export type SnoozeChoice = "tomorrow" | "monday" | "change";

export const SNOOZE_CHOICES: { value: SnoozeChoice; label: string }[] = [
  { value: "tomorrow", label: "Tomorrow, 9:00" },
  { value: "monday", label: "Monday, 9:00" },
  { value: "change", label: "Until it changes" },
];

/** 9:00 local time on the next day, or on the next Monday. */
export function wakeTime(choice: "tomorrow" | "monday", now: Date): Date {
  const d = new Date(now);
  d.setHours(9, 0, 0, 0);
  if (choice === "tomorrow") {
    d.setDate(d.getDate() + 1);
  } else {
    // Monday is day 1; from a Monday, that is a week away.
    const ahead = ((8 - d.getDay()) % 7) || 7;
    d.setDate(d.getDate() + ahead);
  }
  return d;
}

export function snoozeFor(choice: SnoozeChoice, mark: string, now: Date): Snooze {
  return choice === "change"
    ? { kind: "change", mark }
    : { kind: "time", until: wakeTime(choice, now).toISOString() };
}

/** Still asleep: the time has not come, or nothing has changed. */
export function isSnoozed(s: Snooze | undefined, mark: string, now: Date): boolean {
  if (!s) return false;
  return s.kind === "time" ? now < new Date(s.until) : s.mark === mark;
}

/** "wakes Mon 9:00", "wakes when it changes". */
export function wakeLabel(s: Snooze): string {
  if (s.kind === "change") return "wakes when it changes";
  const d = new Date(s.until);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `wakes ${day} ${time}`;
}

/** Drops snoozes that have woken or whose item is gone, so the store only holds
 * what is asleep on the board right now. marks maps every id on the board to
 * its current mark. */
export function pruneSnoozes(snoozes: Snoozes, marks: Map<string, string>, now: Date): Snoozes {
  const next: Snoozes = {};
  for (const [id, s] of Object.entries(snoozes)) {
    const mark = marks.get(id);
    if (mark !== undefined && isSnoozed(s, mark, now)) next[id] = s;
  }
  return next;
}

/** Reads the stored map, keeping only well-formed entries. */
export function parseSnoozes(raw: string | null): Snoozes {
  try {
    const obj = JSON.parse(raw ?? "{}");
    const out: Snoozes = {};
    for (const [id, s] of Object.entries(obj ?? {})) {
      const v = s as Partial<Snooze> & { until?: unknown; mark?: unknown };
      if (v?.kind === "time" && typeof v.until === "string") out[id] = { kind: "time", until: v.until };
      else if (v?.kind === "change" && typeof v.mark === "string") out[id] = { kind: "change", mark: v.mark };
    }
    return out;
  } catch {
    return {};
  }
}
