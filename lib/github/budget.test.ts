import { describe, it, expect } from "vitest";
import { budgetFrom, budgetHeaders } from "./budget";

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
    expect(budgetHeaders(data, { "X-Partial": "1" })).toEqual({
      "X-Partial": "1",
      "X-Cost": "17",
      "X-Budget-Remaining": "4231",
      "X-Budget-Reset": "2026-08-27T13:00:00.000Z",
    });
  });

  it("leaves the route's own headers alone when GitHub said nothing", () => {
    expect(budgetHeaders({ search: {} }, { "X-Partial": "1" })).toEqual({ "X-Partial": "1" });
    expect(budgetHeaders({ search: {} })).toEqual({});
  });
});
