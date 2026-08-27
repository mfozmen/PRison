// Dashboard state-change detection and notification helpers for auto refresh.
//
// Notifications fire only while a PRison tab is open — there is no service
// worker, so closing the last tab stops both polling and notifications.

import type { StuckPr, ReviewRequest, ReadyPr, PrComment, ClosedPr, ReviewedPr } from "./types";

/** Selectable auto-refresh intervals. Each poll costs 6 endpoint calls (the
 * comments one runs two searches), so the shortest option is 5 minutes —
 * enough to notice a blocked PR without burning rate limit on a tab left open
 * all day. */
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

/** Whether a newly picked interval is worth telling the server about.
 *
 * Two runs say no: the first, which is only the page reading back what it
 * stored (announcing that would overwrite a newer choice made in another tab),
 * and a repeat of a number already announced — which is what React's
 * development StrictMode produces by running every effect twice on mount. */
export function shouldAnnounceInterval(announced: number | null, picked: number): boolean {
  return announced !== null && announced !== picked;
}

/** What a PR (or comment thread) is doing right now, coarse enough that
 * ordinary churn — a new commit, an age tick, a re-ordered list — doesn't
 * read as a change, but every transition worth interrupting someone for does. */
export type ItemStatus =
  | "ready"
  | "merged"
  | "conflict"
  | "approved"
  | "changes-requested"
  | "failing"
  | "pending"
  | "review"
  | "answered"
  | "comment";

export type StatusEvent = {
  id: string;
  repo: string;
  number: number;
  status: ItemStatus;
  /** Where the event happened. Carried rather than rebuilt from repo and
   * number, because a comment's url anchors the thread itself. */
  url: string;
  /** Freshness stamp for a status that never changes on its own: a thread
   * stays "comment" no matter how many replies land, so without this a second
   * reply would be invisible. */
  at?: string;
};

export type StatusSnapshot = Map<string, StatusEvent>;

/** A stuck PR's status: a conflict outranks a human blocking it, which
 * outranks a red check, which outranks an approval, which outranks everything
 * else that merely holds the merge up.
 *
 * A conflict goes first because nothing else on the PR matters until it is
 * resolved — the same reason it outranks the check state on the card. Without
 * it the news never arrives at all: a conflicted PR with green checks reads as
 * "pending", and the usual route in is from the ready list, so the transition
 * is ready → pending — suppressed by the rule below.
 *
 * Approval sits below a red check because the check is the thing you can act
 * on, and above waiting because it is the outcome you were waiting for. It
 * needs its own status rather than arriving as `ready`: an approved PR reaches
 * the ready list only once nothing else blocks it, so waiting for that means a
 * PR approved while CI is still running — or one needing a second approval —
 * says nothing at all, and "changes requested, then approved" reads as a fall
 * back to waiting, which is exactly what the pending rule suppresses.
 *
 * Waiting on CI and waiting on a review gate deliberately share one status.
 * They are the same news to the reader, and splitting them would fire a
 * notification the moment CI finished green on a PR still awaiting review —
 * announcing a step forward as if it were a setback. */
function stuckStatus(pr: StuckPr): ItemStatus {
  if (pr.mergeState === "DIRTY") return "conflict";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "changes-requested";
  // failingChecks, not failing.length: a red check that reports no name is
  // counted but never named, and reading it as "waiting" would silence the
  // notification for a PR the card itself shows as failing.
  if (pr.failingChecks > 0) return "failing";
  return pr.reviewDecision === "APPROVED" ? "approved" : "pending";
}

/** Snapshot what every visible item is doing, keyed by id.
 *
 * Callers pass the *visible* (filtered, post-arbitration) lists, so a hidden
 * bot comment or a filtered draft can never announce itself. The two history
 * sections are the exception to "visible": both are collapsed by default, and
 * neither a merge nor an author answering your review stops being news because
 * the section happens to be folded. Each contributes on one condition only —
 * closed PRs when merged (a close without a merge isn't progress), reviewed
 * PRs when the author has pushed since you looked. */
export function snapshotStatuses(lists: {
  ready: readonly ReadyPr[];
  stuck: readonly StuckPr[];
  reviews: readonly ReviewRequest[];
  comments: readonly PrComment[];
  closed: readonly ClosedPr[];
  reviewed: readonly ReviewedPr[];
}): StatusSnapshot {
  const snapshot: StatusSnapshot = new Map();
  const add = (
    item: { id: string; repo: string; number: number; url: string },
    status: ItemStatus,
    at?: string,
  ) => {
    const { id, repo, number, url } = item;
    if (!snapshot.has(id)) snapshot.set(id, { id, repo, number, url, status, at });
  };
  // Closed goes first: GitHub's search index lags, so a PR merged moments ago
  // can still come back from the is:open ready query. First-wins means the
  // merge would otherwise be held back a whole poll interval.
  for (const pr of lists.closed) {
    if (pr.merged) add(pr, "merged");
  }
  for (const pr of lists.ready) add(pr, "ready");
  for (const pr of lists.stuck) add(pr, stuckStatus(pr));
  // Stamped only when requestedAt dates the request itself. A second, genuine
  // request otherwise says nothing: the snapshot never forgets an id, so the PR
  // that left the queue when you reviewed it comes back already on record as
  // "review". The stamp is what makes the new request visible — and it is
  // withheld for a team-originated request, where requestedAt falls back to the
  // PR's updatedAt and would re-announce "needs your review" every time anyone
  // so much as commented.
  for (const req of lists.reviews) {
    add(req, "review", req.requestedDirectly ? req.requestedAt : undefined);
  }
  // A PR you already reviewed contributes only once the author has answered
  // with code. Reviewing it is something you just did yourself, and a review
  // the author dismissed is not a request for anything.
  //
  // Stamped with your own review time so a second round works: after you
  // review again the stamp moves, and the next push the author makes reads as
  // news rather than as the same "answered" already on record. It goes after
  // the review requests, so a PR asked of you again keeps the stronger status.
  for (const pr of lists.reviewed) {
    if (pr.updatedSince) add(pr, "answered", pr.reviewedAt);
  }
  for (const c of lists.comments) add(c, "comment", c.commentedAt);
  return snapshot;
}

/** Items that appeared, plus items whose status or freshness stamp changed.
 * Items that vanished report nothing — they left the board because they were
 * dealt with. Falling back to "pending" reports nothing either: that is what
 * pushing a fix looks like from here, and the red checks that follow will
 * announce themselves soon enough. */
export function diffStatuses(
  prev: StatusSnapshot,
  next: StatusSnapshot,
): StatusEvent[] {
  const events: StatusEvent[] = [];
  for (const [id, event] of next) {
    const seen = prev.get(id);
    // A first sighting always reports, "pending" included — whatever the item
    // is doing, its arrival is the news. Only afterwards does a fall back to
    // waiting go unmentioned.
    const moved =
      !!seen &&
      (seen.status !== event.status || seen.at !== event.at) &&
      event.status !== "pending";
    if (!seen || moved) events.push(event);
  }
  return events;
}

/** How each status reads in prose. Exported because the activity feed says the
 * same things on screen, and two tables would eventually disagree about what a
 * status means. */
export const PHRASES: Record<ItemStatus, string> = {
  ready: "is ready to merge",
  merged: "was merged",
  conflict: "— merge conflict",
  approved: "— approved",
  "changes-requested": "— changes requested",
  failing: "— checks failing",
  pending: "— waiting on checks or review",
  review: "needs your review",
  answered: "— updated since your review",
  comment: "— new reply",
};

/** Longest run of events spelled out before the rest collapses into a count.
 * A notification is glanced at, not read. */
const MAX_LINES = 3;

/** One line per event, so the notification says what actually happened
 * instead of just how many things did. The tail is what gets spelled out —
 * the event that raised this notification is in it, and burying that under
 * three older ones is the one thing a replacement notification must not do. */
export function describeEvents(events: readonly StatusEvent[]): string {
  const lines = events
    .slice(-MAX_LINES)
    .map((e) => `${e.repo} #${e.number} ${PHRASES[e.status]}`);
  if (events.length > MAX_LINES) {
    lines.push(`+${events.length - MAX_LINES} more`);
  }
  return lines.join("\n");
}

/** A tag makes successive notifications replace one another rather than stack
 * a pile of them up while the user is away. Omitting it opts out of that:
 * without a tag every send is its own notification. */
function notify(body: string, tag?: string): void {
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
 * from a console.
 *
 * Deliberately untagged. A tag would mean the second click merely *replaces*
 * the notification the first one left in the notification center, and both
 * macOS and Windows apply that replacement silently — no banner, no sound. The
 * button would work exactly once and then look broken. Stacking is right here:
 * every click is a question the user just asked out loud. */
export function showTestNotification(): void {
  notify("Notifications are on — you'll get one when a PR changes state.");
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

export const SNAPSHOT_KEY = "prison.statusSnapshot";

/** How many ids the stored snapshot remembers.
 *
 * The snapshot accumulates rather than resets, so an item that leaves the
 * board and comes back doesn't re-announce itself — which means it only ever
 * grows. Bounded so a tab left running for a year can't fill localStorage;
 * the oldest ids fall off, and the worst that costs is one repeated event for
 * something last seen thousands of items ago. */
export const MAX_SNAPSHOT_ENTRIES = 1000;

export function serializeSnapshot(snapshot: StatusSnapshot): string {
  return JSON.stringify([...snapshot.values()].slice(-MAX_SNAPSHOT_ENTRIES));
}

/** Read a stored snapshot back.
 *
 * An unreadable value reads as no snapshot, which costs only the catch-up on
 * one open — a throw here would take the dashboard down instead. Entries are
 * validated individually against the known statuses: an unknown one would be
 * diffed against and could emit an event the feed can't put into words.
 * Failing that check drops the entry, so its item simply reads as new. */
export function parseSnapshot(raw: string | null): StatusSnapshot {
  const snapshot: StatusSnapshot = new Map();
  if (!raw) return snapshot;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return snapshot;
  }
  if (!Array.isArray(parsed)) return snapshot;
  for (const value of parsed.slice(-MAX_SNAPSHOT_ENTRIES)) {
    if (isStatusEvent(value)) snapshot.set(value.id, value);
  }
  return snapshot;
}

export function isStatusEvent(value: unknown): value is StatusEvent {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.repo === "string" &&
    typeof e.number === "number" &&
    typeof e.status === "string" &&
    // An own-property check rather than `in`: "constructor" is on every
    // object's prototype chain and would validate as a status nothing can
    // describe.
    Object.hasOwn(PHRASES, e.status) &&
    typeof e.url === "string" &&
    (e.at === undefined || typeof e.at === "string")
  );
}
