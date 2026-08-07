import { graphql, GraphqlResponseError } from "@octokit/graphql";

export function ghClient(token: string) {
  return graphql.defaults({ headers: { authorization: `token ${token}` } });
}

// Runs a query but tolerates partial failures. GitHub returns the data it
// could resolve alongside an `errors` array when, for example, one
// organization forbids the token (org PAT/app restrictions). @octokit throws on
// any errors and discards the partial data, which would lose every other org's
// results too — so on a GraphqlResponseError we keep whatever data did come
// back and drop the failed parts. Other errors (network, auth) still throw.
// Returns `{ data, partial }` where `partial: true` means the response was
// incomplete due to per-org errors.
export async function ghQuery<T>(
  token: string,
  query: string,
  vars?: Record<string, unknown>,
): Promise<{ data: T; partial: boolean }> {
  try {
    const data = (await ghClient(token)(query, vars)) as T;
    return { data, partial: false };
  } catch (e) {
    if (e instanceof GraphqlResponseError && e.data) return { data: e.data as T, partial: true };
    // A dashboard refresh fires six of these at once and GitHub answers a burst
    // with a secondary rate limit — which is account-wide, so every list on the
    // board fails together and the page looks broken. It clears in about a
    // second, which is why hitting Retry has always "fixed" it. Waiting once is
    // that same Retry, without the human.
    const wait = secondaryLimitWaitMs(e);
    if (wait !== null) {
      await new Promise((r) => setTimeout(r, wait));
      try {
        const data = (await ghClient(token)(query, vars)) as T;
        return { data, partial: false };
      } catch (retryError) {
        if (retryError instanceof GraphqlResponseError && retryError.data) {
          return { data: retryError.data as T, partial: true };
        }
        logUpstreamError(retryError);
        throw retryError;
      }
    }
    logUpstreamError(e);
    throw e;
  }
}

// How long to wait before the single retry, or null when retrying would just be
// a second way to fail.
//
// Deliberately NOT the hourly point budget (a RATE_LIMITED GraphQL error):
// that one resets on the hour, so an immediate retry only spends the quota it
// is out of.
const MAX_WAIT_MS = 5_000;
const JITTER_MS = 500;
function secondaryLimitWaitMs(e: unknown): number | null {
  const err = (e ?? {}) as {
    status?: number;
    message?: string;
    response?: { headers?: Record<string, string> };
  };
  if (err.status !== 403 && err.status !== 429) return null;
  const retryAfter = Number(err.response?.headers?.["retry-after"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    // Coming back before GitHub said we may can extend the block, so a wait
    // longer than a refresh should take is a reason not to retry at all —
    // never a reason to retry early. The banner and its Retry button are the
    // honest answer there.
    return retryAfter * 1000 > MAX_WAIT_MS ? null : withJitter(retryAfter * 1000);
  }
  // Without the header GitHub still names it in the body. A 403 that is a
  // permission problem must not be retried — it would fail identically.
  if (!/secondary rate limit|abuse detection/i.test(err.message ?? "")) return null;
  return withJitter(1_000);
}

// The six queries a refresh makes are rejected together by an account-wide
// limit, so a fixed wait would wake them together too — re-firing the very
// burst that tripped it, at twice the size.
function withJitter(ms: number): number {
  return ms + Math.floor(Math.random() * JITTER_MS);
}

// Every route turns this throw into a bare 502, so without a line here the
// server keeps no trace of why — and "it works when I hit Retry" is exactly the
// failure you cannot diagnose after the fact.
//
// Field by field, never the error object: an octokit HttpError carries the
// request it made, headers and all, and that includes the authorization token.
function logUpstreamError(e: unknown): void {
  const err = (e ?? {}) as {
    status?: number;
    name?: string;
    message?: string;
    errors?: { type?: string; message?: string }[];
  };
  // GraphQL errors carry the answer (RATE_LIMITED, a timeout, a bad variable)
  // in the array, not in the top-level message — which only ever says "Request
  // failed due to following response errors:".
  // Array-checked, not ??-defaulted: this runs on the failure path, and a .map
  // that throws here would replace the upstream error with a TypeError from
  // inside its own handler.
  const errors = Array.isArray(err.errors) ? err.errors : [];
  const detail = errors
    .map((x) => `${x?.type ?? "?"}: ${String(x?.message ?? "").slice(0, 160)}`)
    .join(" | ");
  console.error(
    `[github] upstream query failed: status=${err.status ?? "?"} name=${err.name ?? "?"} ` +
      (detail || String(err.message ?? "no detail").slice(0, 200)),
  );
}
