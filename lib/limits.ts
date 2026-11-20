// Wait limits: how long each queue may wait before it is late. Off until the
// user sets one, so nobody gets a red board they didn't ask for.

export type LimitQueue = "stuck" | "review" | "reply" | "others";
export type Limits = Partial<Record<LimitQueue, number>>; // hours

export const LIMIT_QUEUES: { key: LimitQueue; label: string; help: string }[] = [
  { key: "review", label: "Review requested", help: "A teammate waits on your review." },
  { key: "reply", label: "Reply to a comment", help: "Someone asked you something." },
  { key: "stuck", label: "Your PR stuck", help: "Checks, a conflict or a rule holds it." },
  { key: "others", label: "Waiting on others", help: "Your PR waits on a reviewer." },
];

/** The choices offered, in hours; 0 is Off. */
export const LIMIT_OPTIONS = [0, 4, 8, 24, 48, 72, 168];

export function limitLabel(hours: number): string {
  if (hours === 0) return "Off";
  if (hours % 168 === 0) return hours === 168 ? "1 week" : `${hours / 168} weeks`;
  if (hours % 24 === 0) return hours === 24 ? "1 day" : `${hours / 24} days`;
  return `${hours}h`;
}

/** "6h", "1d", "3d": the compact form for chips. */
function short(ms: number): string {
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  return hours >= 24 ? `${Math.round(hours / 24)}d` : `${hours}h`;
}

export type LimitState = {
  /** How far through the limit it is, 0–100 (capped). */
  pct: number;
  state: "ok" | "due" | "late";
  /** "Due in 6h" from three quarters through, "Late · 1d over" after; null before. */
  label: string | null;
};

export function limitState(sinceIso: string, limitHours: number | undefined, now: Date): LimitState | null {
  if (!limitHours) return null;
  const waited = now.getTime() - new Date(sinceIso).getTime();
  const limit = limitHours * 3_600_000;
  const pct = Math.min(100, Math.max(0, (waited / limit) * 100));
  if (waited >= limit) return { pct, state: "late", label: `Late · ${short(waited - limit)} over` };
  if (waited >= limit * 0.75) return { pct, state: "due", label: `Due in ${short(limit - waited)}` };
  return { pct, state: "ok", label: null };
}

export function parseLimits(raw: string | null): Limits {
  try {
    const obj = JSON.parse(raw ?? "{}");
    const out: Limits = {};
    for (const { key } of LIMIT_QUEUES) {
      const v = obj?.[key];
      if (typeof v === "number" && LIMIT_OPTIONS.includes(v) && v > 0) out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}
