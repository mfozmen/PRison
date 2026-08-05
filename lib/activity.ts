// The activity feed: the in-page record of everything the poll detected.
//
// Change detection (lib/notify.ts) already produces the events. Until now they
// went only to a desktop notification and a tab-title count, and both throw
// them away — the notification because the operating system may silently
// refuse to show it, the count because it clears the instant the tab regains
// focus, which is before anyone has read it. This module keeps them instead.

import { PHRASES, type StatusEvent } from "./notify";

export type ActivityEntry = StatusEvent & {
  /** When PRison noticed, not when GitHub recorded it. The two differ by up to
   * one poll interval, and the feed is a log of what PRison told the user. */
  recordedAt: string;
  seen: boolean;
};

/** Long enough to cover a workday of churn, short enough that the whole log
 * stays a few KB and the panel stays scannable. The oldest fall off the end. */
export const MAX_ENTRIES = 100;

export const ACTIVITY_KEY = "prison.activity";

/** Record a poll's events, newest first.
 *
 * The same PR appears as many times as it changed: ready → failing → ready is
 * three entries, because a timeline that collapses them can't answer when the
 * check went red. Repeats aren't a risk here — diffStatuses only emits on an
 * actual change. */
export function appendEvents(
  log: readonly ActivityEntry[],
  events: readonly StatusEvent[],
  now: Date,
): ActivityEntry[] {
  if (events.length === 0) return [...log];
  const recordedAt = now.toISOString();
  // Reversed: events arrive in list order, and the last one is the most recent
  // news, so it has to end up at the top of a newest-first log.
  const fresh = [...events]
    .reverse()
    .map((event) => ({ ...event, recordedAt, seen: false }));
  return [...fresh, ...log].slice(0, MAX_ENTRIES);
}

function isEntry(value: unknown): value is ActivityEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.repo === "string" &&
    typeof e.number === "number" &&
    // Against the known set, not merely "is a string": the feed looks the
    // status up in PHRASES to say what happened, and a status this version
    // doesn't know would render a row with a blank explanation. hasOwnProperty
    // rather than `in`, or "constructor" would validate and hand the row a
    // function to render.
    typeof e.status === "string" &&
    Object.prototype.hasOwnProperty.call(PHRASES, e.status) &&
    typeof e.url === "string" &&
    typeof e.recordedAt === "string" &&
    typeof e.seen === "boolean"
  );
}

/** Read a stored log back.
 *
 * Anything unrecognisable reads as no history: the value is hand-editable, it
 * outlives the version that wrote it, and a feed that throws on startup would
 * take the whole dashboard down with it. Individual malformed entries are
 * dropped rather than failing the whole log — losing one row beats losing the
 * history around it. */
export function parseActivity(raw: string | null): ActivityEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isEntry).slice(0, MAX_ENTRIES);
}

export function unseenCount(log: readonly ActivityEntry[]): number {
  return log.reduce((n, entry) => (entry.seen ? n : n + 1), 0);
}

/** Mark the whole log read. Returns the same array when nothing was unseen, so
 * opening an already-read panel doesn't churn state or rewrite storage. */
export function markAllSeen(log: readonly ActivityEntry[]): ActivityEntry[] {
  if (unseenCount(log) === 0) return log as ActivityEntry[];
  return log.map((entry) => (entry.seen ? entry : { ...entry, seen: true }));
}
