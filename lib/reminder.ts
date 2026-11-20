import type { AwaitingPr, Reviewer } from "@/lib/types";

/** The reviewers a PR actually waits on: a pending request, or a changes
 * request the author has pushed an answer to. */
export function waitingOn(pr: AwaitingPr): Reviewer[] {
  return pr.reviewers.filter(
    (r) => r.state === "requested" || (r.state === "changes" && r.pushedSince),
  );
}

/** "3 days", "5 hours", "a few minutes": how long, said the way a person would. */
export function waitWords(sinceIso: string, now: Date): string {
  const ms = now.getTime() - new Date(sinceIso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return days === 1 ? "a day" : `${days} days`;
  }
  if (hours >= 1) return hours === 1 ? "an hour" : `${hours} hours`;
  return "a few minutes";
}

/** A short, polite nudge for the clipboard. PRison never posts it; the user
 * pastes it wherever their team talks. */
export function reminderText(pr: AwaitingPr, now: Date): string {
  const who = waitingOn(pr);
  const names = who.map((r) => `@${r.name}`).join(" ");
  const ref = `${pr.repo}#${pr.number}`;
  const again = who.length > 0 && who.every((r) => r.state === "changes");
  return again
    ? `Hi ${names}, I've pushed changes since your review on ${ref} (${pr.title}). Could you take another look when you get a moment? Thanks!`
    : `Hi ${names}, when you get a moment, could you take a look at ${ref} (${pr.title})? It's been waiting ${waitWords(pr.waitingSince, now)}. Thanks!`;
}
