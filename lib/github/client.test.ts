/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GraphqlResponseError } from "@octokit/graphql";

const { graphqlMock } = vi.hoisted(() => ({ graphqlMock: vi.fn() }));

vi.mock("@octokit/graphql", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, graphql: { defaults: () => graphqlMock } };
});

import { ghQuery } from "./client";

// The retry path asserts call counts, which only mean anything from zero.
// Braces, not a concise body: mockReset returns the mock, and a beforeEach that
// returns a function hands Vitest a teardown callback — it would then CALL the
// mock after each test and reject into nobody's hands.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  graphqlMock.mockReset();
  // Every failure-path test below exercises the real logUpstreamError call,
  // which is correct in production but turns a green run into a wall of
  // "upstream query failed" stderr lines. Silence it here; the "what it
  // leaves behind on a failure" tests install their own spy on top of this
  // one to assert on what got logged, then restore back down to this spy —
  // so keep our own reference instead of re-deriving it from console.error,
  // which by then points at whatever the inner spy restored it to.
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("ghQuery", () => {
  it("returns the data on success", async () => {
    graphqlMock.mockResolvedValue({ viewer: { login: "me" } });
    expect(await ghQuery("t", "query")).toEqual({ data: { viewer: { login: "me" } }, partial: false });
  });

  it("keeps partial data when GitHub reports per-org errors", async () => {
    const err = new GraphqlResponseError({} as any, {} as any, {
      data: { search: { nodes: [{ id: "1" }] } },
      errors: [{ message: "`acme` forbids access" }],
    } as any);
    graphqlMock.mockRejectedValue(err);
    expect(await ghQuery("t", "query")).toEqual({ data: { search: { nodes: [{ id: "1" }] } }, partial: true });
  });

  it("rethrows non-GraphQL errors (network, auth)", async () => {
    graphqlMock.mockRejectedValue(new Error("network down"));
    await expect(ghQuery("t", "query")).rejects.toThrow("network down");
  });
});

describe("ghQuery — the concurrency gate", () => {
  // A deferred query: resolve/reject it by hand so a test can hold slots open
  // and observe how many made it through.
  function gate() {
    let release!: (v: unknown) => void;
    let fail!: (e: unknown) => void;
    const promise = new Promise((res, rej) => {
      release = res;
      fail = rej;
    });
    return { promise, release, fail };
  }

  it("never lets more than three queries reach GitHub at once", async () => {
    const gates = Array.from({ length: 7 }, gate);
    let started = 0;
    graphqlMock.mockImplementation(() => gates[started++].promise);

    // Seven at once is exactly what a refresh sends: six fetches, one of which
    // issues two queries of its own.
    const all = Promise.all(Array.from({ length: 7 }, () => ghQuery("t", "query")));
    await vi.waitFor(() => expect(started).toBe(3));

    // The other four are queued, not merely slow — nothing more starts until
    // one of the three finishes.
    await Promise.resolve();
    expect(started).toBe(3);

    gates[0].release({ ok: 1 });
    await vi.waitFor(() => expect(started).toBe(4));

    gates.slice(1).forEach((g) => g.release({ ok: 1 }));
    expect(await all).toHaveLength(7);
    expect(started).toBe(7);
  });

  it("hands the slot to the next waiter instead of releasing it into a race", async () => {
    // Release-then-reacquire would let a query arriving in the same tick take
    // the slot a waiter was already woken for, and both would run — four in
    // flight against a cap of three.
    const gates = Array.from({ length: 5 }, gate);
    let started = 0;
    graphqlMock.mockImplementation(() => gates[started++].promise);

    const first = Array.from({ length: 4 }, () => ghQuery("t", "query"));
    await vi.waitFor(() => expect(started).toBe(3));

    // The fourth is queued; a fifth arrives at the moment a slot frees.
    gates[0].release({ ok: 1 });
    const late = ghQuery("t", "query");
    await vi.waitFor(() => expect(started).toBe(4));
    await Promise.resolve();
    expect(started).toBe(4);

    gates.slice(1).forEach((g) => g.release({ ok: 1 }));
    await Promise.all([...first, late]);
  });

  it("frees the slot when a query throws", async () => {
    // A leaked slot is a dashboard that gets slower every refresh until it
    // stops making requests at all.
    graphqlMock.mockRejectedValue(new Error("network down"));
    for (let i = 0; i < 5; i++) {
      await expect(ghQuery("t", "query")).rejects.toThrow("network down");
    }
    graphqlMock.mockResolvedValue({ ok: true });
    expect(await ghQuery("t", "query")).toEqual({ data: { ok: true }, partial: false });
  });

  it("frees the slot when GitHub answers with partial data", async () => {
    // The partial path returns through a catch, which is the branch a naive
    // release-on-success would miss.
    const partialErr = new GraphqlResponseError({} as any, {} as any, {
      data: { search: { nodes: [] } },
      errors: [{ message: "`acme` forbids access" }],
    } as any);
    graphqlMock.mockRejectedValue(partialErr);
    for (let i = 0; i < 5; i++) {
      expect((await ghQuery("t", "query")).partial).toBe(true);
    }
    graphqlMock.mockReset();
    graphqlMock.mockResolvedValue({ ok: true });
    expect(await ghQuery("t", "query")).toEqual({ data: { ok: true }, partial: false });
  });
});

describe("ghQuery — the secondary rate limit", () => {
  // A refresh fires six of these at once; GitHub answers a burst account-wide,
  // so every list on the board fails together and the page looks broken.
  // Retry-After by default, because that is the only shape that earns a retry.
  const secondary = (over: Record<string, unknown> = {}) =>
    Object.assign(new Error("You have exceeded a secondary rate limit"), {
      status: 403,
      response: { headers: { "retry-after": "1" } },
      ...over,
    });

  // Fake timers for the whole block, installed and removed in pairs: the waits
  // here are seconds long, and a useRealTimers() left at the end of a test body
  // never runs when an assertion above it fails — leaking fake timers into
  // every test after it.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Past the longest wait plus the jitter on top of it.
  const settle = (ms: number) => vi.advanceTimersByTimeAsync(ms + 2_000);

  it("waits and retries once, so the burst reads as a hiccup", async () => {
    graphqlMock
      .mockRejectedValueOnce(secondary())
      .mockResolvedValueOnce({ viewer: { login: "me" } });
    const p = ghQuery("t", "query");
    await settle(1_000);
    await expect(p).resolves.toEqual({ data: { viewer: { login: "me" } }, partial: false });
    expect(graphqlMock).toHaveBeenCalledTimes(2);
  });

  it("waits as long as Retry-After asks", async () => {
    graphqlMock
      .mockRejectedValueOnce(secondary({ response: { headers: { "retry-after": "2" } } }))
      .mockResolvedValueOnce({ ok: true });
    const p = ghQuery("t", "query");
    await settle(2_000);
    await expect(p).resolves.toEqual({ data: { ok: true }, partial: false });
  });

  it("steps aside when GitHub asks for longer than a refresh should take", async () => {
    // Coming back early can extend the block, so a long Retry-After is a reason
    // not to retry at all. The banner and its Retry button say the rest.
    graphqlMock.mockRejectedValue(secondary({ response: { headers: { "retry-after": "60" } } }));
    await expect(ghQuery("t", "query")).rejects.toThrow("secondary rate limit");
    expect(graphqlMock).toHaveBeenCalledTimes(1);
  });

  it("steps aside when GitHub does not say how long the block runs", async () => {
    // A short guess re-fires the burst that tripped the limit; a safe one holds
    // the dashboard open for a minute. Neither is better than the banner.
    graphqlMock.mockRejectedValue(secondary({ response: { headers: {} } }));
    await expect(ghQuery("t", "query")).rejects.toThrow("secondary rate limit");
    expect(graphqlMock).toHaveBeenCalledTimes(1);
  });

  it("leaves the ceiling room for the jitter rather than letting it decide", async () => {
    // 5s is the ceiling exactly, so a wait plus its jitter no longer fits. The
    // header decides on its own — otherwise a coin flip would be the difference
    // between a list coming back and a list showing an error banner, and six
    // lists would each flip it separately.
    graphqlMock.mockRejectedValue(secondary({ response: { headers: { "retry-after": "5" } } }));
    await expect(ghQuery("t", "query")).rejects.toThrow("secondary rate limit");
    expect(graphqlMock).toHaveBeenCalledTimes(1);

    // 3s does fit, jitter and all, so it retries every time.
    graphqlMock.mockReset();
    graphqlMock
      .mockRejectedValueOnce(secondary({ response: { headers: { "retry-after": "3" } } }))
      .mockResolvedValueOnce({ ok: true });
    const p = ghQuery("t", "query");
    await settle(3_000);
    await expect(p).resolves.toEqual({ data: { ok: true }, partial: false });
  });

  it("spreads the retries out instead of waking all six together", async () => {
    // A fixed wait would re-fire the very burst that tripped the limit.
    const waits: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      waits.push(ms ?? 0);
      return realSetTimeout(fn, 0);
    }) as typeof setTimeout);
    for (let i = 0; i < 8; i++) {
      graphqlMock.mockRejectedValueOnce(secondary()).mockResolvedValueOnce({ ok: true });
      await ghQuery("t", "query");
    }
    vi.mocked(globalThis.setTimeout).mockRestore();
    expect(new Set(waits).size).toBeGreaterThan(1);
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(1_000);
    expect(Math.max(...waits)).toBeLessThan(3_000);
  });

  it("gives up after the one retry rather than hammering GitHub", async () => {
    graphqlMock.mockRejectedValue(secondary());
    // The assertion is attached before the clock moves: the call rejects while
    // the timers advance, and a handler added a tick later is an unhandled
    // rejection — which fails the run on an otherwise green suite.
    const settled = expect(ghQuery("t", "query")).rejects.toThrow("secondary rate limit");
    await settle(1_000);
    await settled;
    expect(graphqlMock).toHaveBeenCalledTimes(2);
  });

  it("does not hold a slot while it waits out a Retry-After", async () => {
    // The gate is three wide. If the wait happened inside it, three queries
    // sleeping out a one-second block would stop the dashboard dead for that
    // second — turning a limit that hit some of the board into one that hits
    // all of it.
    graphqlMock.mockRejectedValue(secondary());
    const three = Array.from({ length: 3 }, () =>
      expect(ghQuery("t", "query")).rejects.toThrow("secondary rate limit"),
    );
    await vi.waitFor(() => expect(graphqlMock).toHaveBeenCalledTimes(3));

    // All three are now asleep, holding nothing.
    const fourth = expect(ghQuery("t", "query")).rejects.toThrow("secondary rate limit");
    await vi.waitFor(() => expect(graphqlMock).toHaveBeenCalledTimes(4));

    await settle(1_000);
    await Promise.all([...three, fourth]);
  });

  it("keeps partial data the retry came back with", async () => {
    const partialErr = new GraphqlResponseError({} as any, {} as any, {
      data: { search: { nodes: [] } },
      errors: [{ message: "`acme` forbids access" }],
    } as any);
    graphqlMock.mockRejectedValueOnce(secondary()).mockRejectedValueOnce(partialErr);
    const p = ghQuery("t", "query");
    await settle(1_000);
    await expect(p).resolves.toEqual({ data: { search: { nodes: [] } }, partial: true });
  });

  it("does not retry a plain 403 — a permission failure fails identically", async () => {
    graphqlMock.mockRejectedValue(Object.assign(new Error("Resource not accessible"), { status: 403 }));
    await expect(ghQuery("t", "query")).rejects.toThrow("Resource not accessible");
    expect(graphqlMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a permission 403 that happens to carry Retry-After", async () => {
    // The header sizes the wait; it is not what decides there should be one.
    graphqlMock.mockRejectedValue(Object.assign(new Error("Resource not accessible"), {
      status: 403,
      response: { headers: { "retry-after": "1" } },
    }));
    await expect(ghQuery("t", "query")).rejects.toThrow("Resource not accessible");
    expect(graphqlMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 403 that says nothing at all", async () => {
    graphqlMock.mockRejectedValue({ status: 403 });
    await expect(ghQuery("t", "query")).rejects.toBeTruthy();
    expect(graphqlMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 the same way — GitHub uses both codes for this", async () => {
    graphqlMock
      .mockRejectedValueOnce(Object.assign(new Error("Too many requests"), {
        status: 429,
        response: { headers: { "retry-after": "1" } },
      }))
      .mockResolvedValueOnce({ ok: true });
    const p = ghQuery("t", "query");
    await settle(1_000);
    await expect(p).resolves.toEqual({ data: { ok: true }, partial: false });
  });

  it("does not retry the hourly point budget — it resets on the hour, not in a second", async () => {
    const err = new GraphqlResponseError({} as any, {} as any, {
      data: null,
      errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }],
    } as any);
    graphqlMock.mockRejectedValue(err);
    await expect(ghQuery("t", "query")).rejects.toBeTruthy();
    expect(graphqlMock).toHaveBeenCalledTimes(1);
  });

  it("treats an unparseable Retry-After as GitHub not having said", async () => {
    graphqlMock.mockRejectedValue(secondary({ response: { headers: { "retry-after": "soon" } } }));
    await expect(ghQuery("t", "query")).rejects.toThrow("secondary rate limit");
    expect(graphqlMock).toHaveBeenCalledTimes(1);
  });
});

describe("ghQuery — what it leaves behind on a failure", () => {
  // Every route turns the throw into a bare 502, so this line is the only
  // record of why. "It works when I hit Retry" is undiagnosable without it.
  it("logs the GraphQL error types and messages, not the wrapper's", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new GraphqlResponseError({} as any, {} as any, {
      data: null,
      errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }],
    } as any);
    graphqlMock.mockRejectedValue(err);
    await expect(ghQuery("t", "query")).rejects.toBeTruthy();
    expect(spy.mock.calls[0][0]).toContain("RATE_LIMITED: API rate limit exceeded");
    spy.mockRestore();
  });

  it("survives an errors entry with neither a type nor a message", async () => {
    // The logger runs on the failure path; a throw in here would swallow the
    // upstream error and replace it with a TypeError.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new GraphqlResponseError({} as any, {} as any, {
      data: null,
      errors: [{}],
    } as any);
    graphqlMock.mockRejectedValue(err);
    await expect(ghQuery("t", "query")).rejects.toBeTruthy();
    expect(spy.mock.calls[0][0]).toContain("?: ");
    spy.mockRestore();
  });

  it("falls back to the error's own message when there is no errors array", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    graphqlMock.mockRejectedValue(new Error("network down"));
    await expect(ghQuery("t", "query")).rejects.toThrow("network down");
    expect(spy.mock.calls[0][0]).toContain("network down");
    spy.mockRestore();
  });

  it("still writes a line when what was thrown carries nothing at all", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    graphqlMock.mockRejectedValue({});
    await expect(ghQuery("t", "query")).rejects.toBeTruthy();
    expect(spy.mock.calls[0][0]).toContain("status=? name=? no detail");

    // `throw null` is legal, and a logger that dies on it would replace the
    // upstream failure with a TypeError from inside the error path.
    graphqlMock.mockRejectedValue(null);
    await expect(ghQuery("t", "query")).rejects.toBeNull();
    expect(spy.mock.calls[1][0]).toContain("status=? name=? no detail");
    spy.mockRestore();
  });

  it("never writes the request the error carries, which holds the token", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("HttpError"), {
      status: 403,
      request: { headers: { authorization: "token ghp_secret" } },
    });
    graphqlMock.mockRejectedValue(err);
    await expect(ghQuery("t", "query")).rejects.toBeTruthy();
    expect(spy.mock.calls[0][0]).toContain("status=403");
    expect(spy.mock.calls[0][0]).not.toContain("ghp_secret");
    spy.mockRestore();
  });
});
