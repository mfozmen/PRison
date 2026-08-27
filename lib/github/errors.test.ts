/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { GraphqlResponseError } from "@octokit/graphql";

import { upstreamErrorResponse } from "./errors";

// The hourly point budget is not the secondary limit: there is nothing to wait
// out in a few seconds and nothing to retry — only an hour that has to roll.
// Telling the two apart is what lets the board say so instead of showing the
// same "couldn't be loaded" it shows for a network blip.
describe("upstreamErrorResponse", () => {
  const budgetError = (type: string, headers?: Record<string, string>) => {
    const err = new GraphqlResponseError({} as any, {} as any, {
      data: null,
      errors: [{ type, message: "API rate limit exceeded for user ID 1" }],
    } as any) as any;
    if (headers) err.response = { headers };
    return err;
  };

  it("answers 429 with the reset time when the budget is spent", async () => {
    const res = upstreamErrorResponse(
      budgetError("RATE_LIMITED", { "x-ratelimit-reset": "1787828206" }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Reset")).toBe("2026-08-27T10:56:46.000Z");
  });

  // GitHub says RATE_LIMITED on the query that spends the last point and
  // RATE_LIMIT on every one after it. Same wall, two words for it.
  it("recognises the already-exceeded wording too", () => {
    expect(upstreamErrorResponse(budgetError("RATE_LIMIT")).status).toBe(429);
  });

  it("says 429 even when GitHub did not say when the budget returns", () => {
    const res = upstreamErrorResponse(budgetError("RATE_LIMITED"));
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Reset")).toBeNull();
  });

  it("ignores a reset header that is not a time", () => {
    const res = upstreamErrorResponse(budgetError("RATE_LIMITED", { "x-ratelimit-reset": "soon" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Reset")).toBeNull();
  });

  it("leaves every other failure as the 502 it was", () => {
    expect(upstreamErrorResponse(new Error("network down")).status).toBe(502);
    expect(upstreamErrorResponse(null).status).toBe(502);
    expect(
      upstreamErrorResponse(
        new GraphqlResponseError({} as any, {} as any, {
          data: null,
          errors: [{ type: "NOT_FOUND", message: "no" }],
        } as any),
      ).status,
    ).toBe(502);
  });
});
