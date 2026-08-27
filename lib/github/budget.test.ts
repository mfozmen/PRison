import { describe, it, expect } from "vitest";
import { budgetFrom, budgetHeaders, sumBudgets } from "./budget";

// GitHub prices a GraphQL query by the nodes it could return, and the account
// allowance is hourly. Nobody — including PRison — knew what a refresh cost
// until a morning of failures made the question urgent, so every list now
// carries the answer back with it.
describe("what a query cost, as GitHub reported it", () => {
  const data = {
    search: { nodes: [] },
    rateLimit: { cost: 17, remaining: 4231, resetAt: "2026-08-27T13:00:00.000Z" },
  };

  it("reads the rateLimit the query asked for", () => {
    expect(budgetFrom(data)).toEqual({
      cost: 17,
      remaining: 4231,
      resetAt: "2026-08-27T13:00:00.000Z",
    });
  });

  it("says nothing for a response that never asked", () => {
    expect(budgetFrom({ search: { nodes: [] } })).toBeNull();
    expect(budgetFrom(null)).toBeNull();
    expect(budgetFrom("not an object")).toBeNull();
  });

  it("refuses a rateLimit that is not numbers", () => {
    // Each field on its own: a half-read budget is worse than none, since it
    // would be drawn as a real number on the panel.
    expect(budgetFrom({ rateLimit: { cost: "cheap", remaining: 1, resetAt: "x" } })).toBeNull();
    expect(budgetFrom({ rateLimit: { cost: 1, remaining: "lots", resetAt: "x" } })).toBeNull();
    expect(budgetFrom({ rateLimit: { cost: 1, remaining: 1, resetAt: 99 } })).toBeNull();
  });

  it("puts it on the response, next to whatever the route already sends", () => {
    expect(budgetHeaders(budgetFrom(data), { "X-Partial": "1" })).toEqual({
      "X-Partial": "1",
      "X-Cost": "17",
      "X-Budget-Remaining": "4231",
      "X-Budget-Reset": "2026-08-27T13:00:00.000Z",
    });
  });

  it("leaves the route's own headers alone when GitHub said nothing", () => {
    expect(budgetHeaders(null, { "X-Partial": "1" })).toEqual({ "X-Partial": "1" });
    expect(budgetHeaders(null)).toEqual({});
  });

  // Charging a refresh for one of two searches understates it, and the route
  // that runs two is the one running the most expensive query in the app.
  it("adds up a route that ran more than one query", () => {
    const leg = (cost: number, remaining: number) => ({
      rateLimit: { cost, remaining, resetAt: "2026-08-27T13:00:00.000Z" },
    });
    expect(sumBudgets(leg(20, 4000), leg(13, 3987))).toEqual({
      cost: 33,
      remaining: 3987,
      resetAt: "2026-08-27T13:00:00.000Z",
    });
  });

  it("counts the leg that answered when the other did not", () => {
    const leg = { rateLimit: { cost: 20, remaining: 4000, resetAt: "2026-08-27T13:00:00.000Z" } };
    expect(sumBudgets(undefined, leg)?.cost).toBe(20);
  });

  it("says nothing when no leg reported anything", () => {
    expect(sumBudgets(undefined, { search: {} })).toBeNull();
  });
});
