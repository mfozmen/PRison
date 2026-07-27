import type { AgeBucket } from "./types";

const DAY_MS = 86_400_000;

export function ageBucket(sinceISO: string, now: Date): AgeBucket {
  const days = (now.getTime() - new Date(sinceISO).getTime()) / DAY_MS;
  if (days < 1) return "fresh";
  if (days <= 3) return "warning";
  return "urgent";
}

export function sortByAgeAsc<T>(items: T[], key: (t: T) => string): T[] {
  return [...items].sort(
    (a, b) => new Date(key(a)).getTime() - new Date(key(b)).getTime(),
  );
}

// Newest-first mirror of sortByAgeAsc: used for closed PRs, where the most
// recently closed should lead the list.
export function sortByAgeDesc<T>(items: T[], key: (t: T) => string): T[] {
  return [...items].sort(
    (a, b) => new Date(key(b)).getTime() - new Date(key(a)).getTime(),
  );
}

// Compact relative age, e.g. "40m", "3h", "2d". Shared by AgeBadge (with urgency
// colouring) and ClosedPrRow (neutral "merged Xd ago").
export function relativeAge(since: string, now: Date): string {
  const m = Math.floor((now.getTime() - new Date(since).getTime()) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
