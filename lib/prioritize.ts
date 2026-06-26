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
