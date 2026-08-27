/** What one query cost, and what is left of the hour.
 *
 * GitHub prices a GraphQL query by the nodes it could return, and the
 * allowance is hourly and account-wide — shared with every other client signed
 * in as the same user. Nobody knew what a refresh spent until a morning of
 * every-list-failing made the question urgent, so the queries now ask, and the
 * answer rides back to the browser on the response.
 *
 * The `rateLimit` field is itself free: asking costs nothing. */
export type Budget = {
  /** Points this query spent. */
  cost: number;
  /** Points left in the hour, after it. */
  remaining: number;
  /** ISO time the allowance returns to full. */
  resetAt: string;
};

export function budgetFrom(data: unknown): Budget | null {
  if (typeof data !== "object" || data === null) return null;
  const { rateLimit } = data as { rateLimit?: unknown };
  if (typeof rateLimit !== "object" || rateLimit === null) return null;
  const { cost, remaining, resetAt } = rateLimit as Partial<Budget>;
  if (typeof cost !== "number" || typeof remaining !== "number") return null;
  if (typeof resetAt !== "string") return null;
  return { cost, remaining, resetAt };
}

/** The route's own headers, plus the price of what it just did. */
export function budgetHeaders(
  data: unknown,
  headers: Record<string, string> = {},
): Record<string, string> {
  const budget = budgetFrom(data);
  if (!budget) return headers;
  return {
    ...headers,
    "X-Cost": String(budget.cost),
    "X-Budget-Remaining": String(budget.remaining),
    "X-Budget-Reset": budget.resetAt,
  };
}
