import { randomInt } from "node:crypto";
import { graphql, GraphqlResponseError } from "@octokit/graphql";

export function ghClient(token: string) {
  return graphql.defaults({ headers: { authorization: `token ${token}` } });
}

// GitHub documents the secondary rate limit as triggered by CONCURRENT requests
// and asks that a single user's requests be made serially. A refresh did the
// opposite: six fetches at once, one of which issues two queries of its own, so
// seven queries left together and two or three came back as error banners.
//
// Three at a time, measured rather than guessed. Against a real account the
// whole refresh takes ~3.3s bounded versus ~3.2s unbounded — the wall clock is
// set by the slowest single query (2-3s), and the queue drains behind it for
// free. Two costs +1.8s and one costs +5.3s, which is why this is not serial.
// Individual queries also come back FASTER bounded (~2.1s vs ~3.1s at their
// slowest): GitHub is already throttling the burst, so the concurrency was
// never buying the speed it looked like it was.
const MAX_CONCURRENT = 3;

// Per process, not per token — so on an instance several people signed into,
// unrelated accounts would share one queue while the limit they are avoiding is
// per-account. Left that way on purpose: PRison is a dashboard you run for
// yourself, and keying the gate by token would hand anyone who signs in their
// own three slots, which is the wrong direction for a shared box anyway.
let active = 0;
const waiting: (() => void)[] = [];

// Only the request itself is gated, never the retry's wait — a query sleeping
// out a Retry-After holds no slot, or one blocked query would idle a third of
// the queue for as long as the block lasts.
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  else active++;
  try {
    return await fn();
  } finally {
    // Handed to the next waiter rather than released and re-taken: releasing
    // first would let a caller arriving in that same tick claim the slot the
    // waiter was already woken for, and both would run. The count only moves
    // when nobody is queued.
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
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
  // One definition of "ran it", so the retry can never drift from the first
  // attempt on what counts as partial data.
  const runOnce = (): Promise<{ data: T; partial: boolean }> =>
    withSlot(async () => {
      try {
        return { data: (await ghClient(token)(query, vars)) as T, partial: false };
      } catch (e) {
        if (e instanceof GraphqlResponseError && e.data) return { data: e.data as T, partial: true };
        throw e;
      }
    });
  try {
    return await runOnce();
  } catch (e) {
    // The gate above makes a burst far less likely, but the limit is
    // account-wide: another tab, another device, or the queue's own steady
    // three can still trip it, and then every list fails together and the page
    // looks broken. It clears in about a second, which is why hitting Retry has
    // always "fixed" it. Waiting once is that same Retry, without the human.
    const wait = secondaryLimitWaitMs(e);
    if (wait === null) {
      logUpstreamError(e);
      throw e;
    }
    await new Promise((r) => setTimeout(r, wait));
    try {
      return await runOnce();
    } catch (retryError) {
      logUpstreamError(retryError);
      throw retryError;
    }
  }
}

// How long to wait before the single retry, or null when retrying would just be
// a second way to fail.
//
// Deliberately NOT the hourly point budget (a RATE_LIMITED GraphQL error):
// that one resets on the hour, so an immediate retry only spends the quota it
// is out of.
const MAX_WAIT_MS = 5_000;
const JITTER_MS = 2_000;
function secondaryLimitWaitMs(e: unknown): number | null {
  const err = (e ?? {}) as {
    status?: number;
    message?: string;
    response?: { headers?: Record<string, string> };
  };
  if (err.status !== 403 && err.status !== 429) return null;
  // A 403 is far more often a permission problem than a rate limit, and
  // retrying that is just a second way to fail — so GitHub has to name the
  // limit before we wait for it, Retry-After header or not. A 429 only ever
  // means rate.
  if (err.status === 403 && !/secondary rate limit|abuse detection/i.test(err.message ?? "")) {
    return null;
  }
  // Only GitHub knows how long the block runs, so without Retry-After we do not
  // guess: a short guess re-fires the very burst that tripped the limit, and a
  // guess long enough to be safe (GitHub says a minute) holds the whole
  // dashboard open waiting for it. The banner and its Retry button are the
  // honest answer there — as they are for a wait longer than a refresh should
  // take, since coming back before GitHub said we may can extend the block.
  const retryAfter = Number(err.response?.headers?.["retry-after"]);
  if (!Number.isFinite(retryAfter) || retryAfter <= 0) return null;
  // The header alone decides whether there is a retry; the jitter only decides
  // when. The budget leaves room for the jitter on top, so the ceiling holds
  // without a coin flip ever being the difference between a list coming back
  // and a list showing an error banner.
  if (retryAfter * 1000 + JITTER_MS > MAX_WAIT_MS) return null;
  return withJitter(retryAfter * 1000);
}

// Whatever is in flight when an account-wide limit lands is rejected together,
// so a fixed wait would wake them together too — re-firing the very burst that
// tripped it. The spread has to be wide enough that they actually arrive apart,
// which is why it is comparable to the wait itself rather than a rounding error
// on top of it. The queue does not do this job: it caps how many run at once,
// not how far apart they start.
function withJitter(ms: number): number {
  // randomInt over Math.random because this runs server-side and Math.random is
  // flagged wherever it appears; nothing here needs unpredictability, the two
  // are interchangeable for spreading out a wait.
  return ms + randomInt(JITTER_MS);
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
