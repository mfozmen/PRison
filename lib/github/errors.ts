/** How a failed upstream query reaches the browser.
 *
 * Kept apart from the client because every route mocks the client wholesale in
 * its tests, and the shape of an error response is not part of what those
 * tests are pretending about.
 */
/** The hourly GraphQL point budget, spent.
 *
 * Not the secondary limit and not retryable: there is no Retry-After to wait
 * out, only an hour that has to roll. GitHub says RATE_LIMITED on the query
 * that spends the last point and RATE_LIMIT on every one after it, so both
 * words mean the same wall.
 *
 * Returns the reset time as an ISO string, `null` when GitHub did not say —
 * and `undefined` when this is some other failure entirely, which is what
 * separates "come back at four" from "something broke". */
function budgetResetAt(e: unknown): string | null | undefined {
  const err = (e ?? {}) as {
    errors?: { type?: string }[];
    headers?: Record<string, string>;
    response?: { headers?: Record<string, string> };
  };
  const errors = Array.isArray(err.errors) ? err.errors : [];
  if (!errors.some((x) => x?.type === "RATE_LIMITED" || x?.type === "RATE_LIMIT")) return undefined;
  // Two error classes, two places. A GraphqlResponseError puts the HTTP
  // headers on itself and keeps `response` for the GraphQL body; octokit's
  // RequestError puts them under `response`. Reading only one of them is how
  // a feature about a time silently stops carrying the time.
  const headers = err.headers ?? err.response?.headers;
  const reset = Number(headers?.["x-ratelimit-reset"]);
  return Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null;
}

/** What a route answers when a query failed. A spent budget is its own answer
 * — the board can say when it comes back, rather than showing the same notice
 * it shows for a network blip, which is what left us guessing for an hour. */
export function upstreamErrorResponse(...failures: unknown[]): Response {
  // A route that runs two searches has two reasons and one answer to give.
  // A spent budget is the more specific of the two, so it wins.
  const resetAt = failures.map(budgetResetAt).find((r) => r !== undefined);
  if (resetAt === undefined) return new Response("Upstream GitHub error", { status: 502 });
  return new Response("GitHub API budget exhausted", {
    status: 429,
    headers: resetAt ? { "X-RateLimit-Reset": resetAt } : undefined,
  });
}
