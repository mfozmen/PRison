/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { GraphqlResponseError } from "@octokit/graphql";

import { upstreamErrorResponse } from "./errors";

// The hourly point budget is not the secondary limit: there is nothing to wait
// out in a few seconds and nothing to retry — only an hour that has to roll.
// Telling the two apart is what lets the board say so instead of showing the
// same "couldn't be loaded" it shows for a network blip.
describe("upstreamErrorResponse", () => {
  // The real constructor, with the headers where the real one puts them: the
  // second argument, not inside `response` — which holds the GraphQL body.
  const budgetError = (type: string, headers: Record<string, string> = {}) =>
    new GraphqlResponseError({} as any, headers as any, {
      data: null,
      errors: [{ type, message: "API rate limit exceeded for user ID 1" }],
    } as any);

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

  // octokit's REST errors carry the same headers one level down. Both shapes
  // reach these routes, so both have to be read.
  it("finds the reset time under response.headers too", () => {
    const err = Object.assign(new Error("Request failed"), {
      errors: [{ type: "RATE_LIMITED" }],
      response: { headers: { "x-ratelimit-reset": "1787828206" } },
    });
    expect(upstreamErrorResponse(err).headers.get("X-RateLimit-Reset")).toBe(
      "2026-08-27T10:56:46.000Z",
    );
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
