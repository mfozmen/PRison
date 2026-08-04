// Dashboard state-change detection and notification helpers for auto refresh.
//
// Notifications fire only while a PRison tab is open — there is no service
// worker, so closing the last tab stops both polling and notifications.

import type { StuckPr, ReviewRequest, ReadyPr, PrComment, ClosedPr } from "./types";

/** Selectable auto-refresh intervals. Each poll costs 5 API calls, so the
 * shortest option is 5 minutes — enough to notice a blocked PR without
 * burning rate limit on a tab left open all day. */
export const POLL_INTERVAL_OPTIONS = [
  { ms: 5 * 60_000, label: "Every 5 minutes" },
  { ms: 15 * 60_000, label: "Every 15 minutes" },
  { ms: 30 * 60_000, label: "Every 30 minutes" },
  { ms: 60 * 60_000, label: "Every hour" },
] as const;

export const DEFAULT_POLL_INTERVAL_MS = 30 * 60_000;

/** Read a stored interval back, falling back to the default for anything
 * that isn't one of the offered options (missing, stale, or hand-edited). */
export function parsePollInterval(stored: string | null): number {
  const ms = Number(stored);
  return POLL_INTERVAL_OPTIONS.some((o) => o.ms === ms)
    ? ms
    : DEFAULT_POLL_INTERVAL_MS;
}

/** What a PR (or comment thread) is doing right now, coarse enough that
 * ordinary churn — a new commit, an age tick, a re-ordered list — doesn't
 * read as a change, but every transition worth interrupting someone for does. */
export type ItemStatus =
  | "ready"
  | "merged"
  | "changes-requested"
  | "failing"
  | "pending"
  | "blocked"
  | "review"
  | "comment";

export type StatusEvent = {
  id: string;
  repo: string;
  number: number;
  status: ItemStatus;
  /** Freshness stamp for the two statuses that never change on their own:
   * a thread stays "comment" and a request stays "review" no matter how many
   * replies land, so without this a second reply would be invisible. */
  at?: string;
};

export type StatusSnapshot = Map<string, StatusEvent>;

/** A stuck PR's status: a human blocking it outranks a red check, which
 * outranks a running one. With neither, something else blocks the merge —
 * a required review, a conflict — and saying "waiting on checks" would lie. */
function stuckStatus(pr: StuckPr): ItemStatus {
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "changes-requested";
  if (pr.failing.length > 0) return "failing";
  return pr.pending.length > 0 ? "pending" : "blocked";
}

/** Snapshot what every visible item is doing, keyed by id.
 *
 * Callers pass the *visible* (filtered, post-arbitration) lists, so a hidden
 * bot comment or a filtered draft can never announce itself. The closed list
 * is the one exception: it is collapsed by default, and a merge is worth
 * hearing about whether or not the section happens to be expanded. Insertion
 * order is the order events are reported in: good news first, then things
 * that need a human, then the inbox. Closed PRs contribute only when merged
 * — a close without a merge isn't progress. */
export function snapshotStatuses(lists: {
  ready: readonly ReadyPr[];
  stuck: readonly StuckPr[];
  reviews: readonly ReviewRequest[];
  comments: readonly PrComment[];
  closed: readonly ClosedPr[];
}): StatusSnapshot {
  const snapshot: StatusSnapshot = new Map();
  const add = (
    id: string,
    repo: string,
    number: number,
    status: ItemStatus,
    at?: string,
  ) => {
    if (!snapshot.has(id)) snapshot.set(id, { id, repo, number, status, at });
  };
  for (const pr of lists.ready) add(pr.id, pr.repo, pr.number, "ready");
  for (const pr of lists.closed) {
    if (pr.merged) add(pr.id, pr.repo, pr.number, "merged");
  }
  for (const pr of lists.stuck) add(pr.id, pr.repo, pr.number, stuckStatus(pr));
  for (const req of lists.reviews) {
    add(req.id, req.repo, req.number, "review", req.requestedAt);
  }
  for (const c of lists.comments) {
    add(c.id, c.repo, c.number, "comment", c.commentedAt);
  }
  return snapshot;
}

/** Items that appeared, plus items whose status or freshness stamp changed.
 * Items that vanished report nothing — they left the board because they were
 * dealt with. */
export function diffStatuses(
  prev: StatusSnapshot,
  next: StatusSnapshot,
): StatusEvent[] {
  const events: StatusEvent[] = [];
  for (const [id, event] of next) {
    const seen = prev.get(id);
    if (seen?.status !== event.status || seen.at !== event.at) {
      events.push(event);
    }
  }
  return events;
}

const PHRASES: Record<ItemStatus, string> = {
  ready: "is ready to merge",
  merged: "was merged",
  "changes-requested": "— changes requested",
  failing: "— checks failing",
  pending: "— waiting on checks",
  blocked: "— blocked from merging",
  review: "needs your review",
  comment: "— new reply",
};

/** Longest run of events spelled out before the rest collapses into a count.
 * A notification is glanced at, not read. */
const MAX_LINES = 3;

/** One line per event, so the notification says what actually happened
 * instead of just how many things did. */
export function describeEvents(events: readonly StatusEvent[]): string {
  const lines = events
    .slice(0, MAX_LINES)
    .map((e) => `${e.repo} #${e.number} ${PHRASES[e.status]}`);
  if (events.length > MAX_LINES) {
    lines.push(`+${events.length - MAX_LINES} more`);
  }
  return lines.join("\n");
}

/** A fixed tag per kind makes successive polls replace the notification
 * rather than stack a pile of them up while the user is away — and keeps the
 * test send from swallowing a real one. */
function notify(body: string, tag: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  new Notification("PRison", { body, tag });
}

/** Show a desktop notification describing what changed, if permitted. */
export function showChangeNotification(events: readonly StatusEvent[]): void {
  if (events.length === 0) return;
  notify(describeEvents(events), "prison-changes");
}

/** Prove to the user that notifications reach them, from the UI rather than
 * from a console. */
export function showTestNotification(): void {
  notify(
    "Notifications are on — you'll get one when a PR changes state.",
    "prison-test",
  );
}

/** The current permission, guarded for environments without the API (jsdom,
 * iOS Safari). An unsupported browser is reported as denied: from the user's
 * side the outcome is the same, and it keeps callers to three cases. */
export function notificationPermission(): NotificationPermission {
  return typeof Notification === "undefined" ? "denied" : Notification.permission;
}

/** Ask for notification permission, but only when the user hasn't decided yet
 * — never re-prompt after a grant or denial. Resolves with the resulting
 * permission so the caller can put it in state; nothing re-renders on its own
 * when the user answers the browser's prompt. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  // Callback-only implementations (Safari before 16) resolve with nothing.
  const answer = await Notification.requestPermission();
  return answer ?? notificationPermission();
}

const BADGE_RE = /^\(\d+\) /;

/** Prefix the title with an unseen-count badge, replacing any existing one. */
export function withBadge(title: string, count: number): string {
  return `(${count}) ${withoutBadge(title)}`;
}

/** Strip the unseen-count badge; no-op on an unbadged title. */
export function withoutBadge(title: string): string {
  return title.replace(BADGE_RE, "");
}
