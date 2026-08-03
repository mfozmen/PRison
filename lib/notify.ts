// New-item detection and notification helpers for auto refresh.
//
// Notifications fire only while a PRison tab is open — there is no service
// worker, so closing the last tab stops both polling and notifications.

/** Poll interval for auto refresh. 5 API calls per poll stays well within
 * GitHub's limits, and background tabs throttle timers to ~1/min anyway. */
export const POLL_INTERVAL_MS = 60_000;

/** Flatten item lists into a set of stable ids. Callers pass the four work
 * queues (stuck, review requests, ready, comments); closed PRs are history,
 * not a work queue, so they never participate in detection. */
export function collectIds(
  lists: ReadonlyArray<ReadonlyArray<{ id: string }>>,
): Set<string> {
  const ids = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      ids.add(item.id);
    }
  }
  return ids;
}

/** Count ids present in `fresh` but not in `prev`. Removed ids don't count. */
export function countNewIds(
  prev: ReadonlySet<string>,
  fresh: ReadonlySet<string>,
): number {
  let count = 0;
  for (const id of fresh) {
    if (!prev.has(id)) count++;
  }
  return count;
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

/** Show a desktop notification for new items, if permitted. The fixed tag
 * makes successive polls replace the notification instead of stacking. */
export function showNewItemsNotification(count: number): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  new Notification("PRison", {
    body: count === 1 ? "1 new item needs your attention" : `${count} new items need your attention`,
    tag: "prison-new-items",
  });
}

/** Ask for notification permission, but only when the user hasn't decided
 * yet — never re-prompt after a grant or denial. */
export function maybeRequestNotificationPermission(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  void Notification.requestPermission();
}
