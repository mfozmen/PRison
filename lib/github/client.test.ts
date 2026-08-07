/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
beforeEach(() => {
  graphqlMock.mockReset();
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

describe("ghQuery — the secondary rate limit", () => {
  // A refresh fires six of these at once; GitHub answers a burst account-wide,
  // so every list on the board fails together and the page looks broken.
  const secondary = (over: Record<string, unknown> = {}) =>
    Object.assign(new Error("You have exceeded a secondary rate limit"), {
      status: 403,
      ...over,
    });

  it("waits and retries once, so the burst reads as a hiccup", async () => {
    graphqlMock
      .mockRejectedValueOnce(secondary())
      .mockResolvedValueOnce({ viewer: { login: "me" } });
    const res = await ghQuery("t", "query");
    expect(res).toEqual({ data: { viewer: { login: "me" } }, partial: false });
    expect(graphqlMock).toHaveBeenCalledTimes(2);
  });

  it("honours Retry-After when GitHub sends one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    graphqlMock
      .mockRejectedValueOnce(secondary({ response: { headers: { "retry-after": "2" } } }))
      .mockResolvedValueOnce({ ok: true });
    const p = ghQuery("t", "query");
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(p).resolves.toEqual({ data: { ok: true }, partial: false });
    vi.useRealTimers();
  });

  it("caps the wait, so one slow header cannot hang a refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    graphqlMock
      .mockRejectedValueOnce(secondary({ response: { headers: { "retry-after": "600" } } }))
      .mockResolvedValueOnce({ ok: true });
    const p = ghQuery("t", "query");
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).resolves.toEqual({ data: { ok: true }, partial: false });
    vi.useRealTimers();
  });

  it("gives up after the one retry rather than hammering GitHub", async () => {
    graphqlMock.mockRejectedValue(secondary());
    await expect(ghQuery("t", "query")).rejects.toThrow("secondary rate limit");
    expect(graphqlMock).toHaveBeenCalledTimes(2);
  });

  it("keeps partial data the retry came back with", async () => {
    const partialErr = new GraphqlResponseError({} as any, {} as any, {
      data: { search: { nodes: [] } },
      errors: [{ message: "`acme` forbids access" }],
    } as any);
    graphqlMock.mockRejectedValueOnce(secondary()).mockRejectedValueOnce(partialErr);
    expect(await ghQuery("t", "query")).toEqual({ data: { search: { nodes: [] } }, partial: true });
  });

  it("does not retry a plain 403 — a permission failure fails identically", async () => {
    graphqlMock.mockRejectedValue(Object.assign(new Error("Resource not accessible"), { status: 403 }));
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
    await expect(ghQuery("t", "query")).resolves.toEqual({ data: { ok: true }, partial: false });
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

  it("ignores an unparseable Retry-After and falls back to the body", async () => {
    graphqlMock
      .mockRejectedValueOnce(secondary({ response: { headers: { "retry-after": "soon" } } }))
      .mockResolvedValueOnce({ ok: true });
    await expect(ghQuery("t", "query")).resolves.toEqual({ data: { ok: true }, partial: false });
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
