/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { GraphqlResponseError } from "@octokit/graphql";

const { graphqlMock } = vi.hoisted(() => ({ graphqlMock: vi.fn() }));

vi.mock("@octokit/graphql", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, graphql: { defaults: () => graphqlMock } };
});

import { ghQuery } from "./client";

describe("ghQuery", () => {
  it("returns the data on success", async () => {
    graphqlMock.mockResolvedValue({ viewer: { login: "me" } });
    expect(await ghQuery("t", "query")).toEqual({ data: { viewer: { login: "me" } }, partial: false });
  });

  it("keeps partial data when GitHub reports per-org errors", async () => {
    const err = new GraphqlResponseError({} as any, {} as any, {
      data: { search: { nodes: [{ id: "1" }] } },
      errors: [{ message: "`useinsider` forbids access" }],
    } as any);
    graphqlMock.mockRejectedValue(err);
    expect(await ghQuery("t", "query")).toEqual({ data: { search: { nodes: [{ id: "1" }] } }, partial: true });
  });

  it("rethrows non-GraphQL errors (network, auth)", async () => {
    graphqlMock.mockRejectedValue(new Error("network down"));
    await expect(ghQuery("t", "query")).rejects.toThrow("network down");
  });
});
