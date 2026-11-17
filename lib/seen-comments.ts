import type { PrComment } from "./types";

/** Comments the user marked as seen on the board, as comment id → the
 * commentedAt it was marked at. Keyed by the timestamp, not just the id, so a
 * new reply on the thread moves commentedAt and brings the comment back — a
 * mark answers for what the user saw, never for what came after it.
 *
 * shortcut: ids of threads that left the list are never pruned; prune against
 * a complete (non-X-Incomplete) load if the stored map ever grows noticeable. */
export type SeenComments = Record<string, string>;

export function isSeen(c: Pick<PrComment, "id" | "commentedAt">, seen: SeenComments): boolean {
  return seen[c.id] === c.commentedAt;
}

/** Safe JSON.parse from localStorage — same contract as parseIgnored: never
 * throws, drops anything that is not an id → timestamp string pair. */
export function parseSeen(raw: string | null): SeenComments {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}
