import { describe, it, expect } from "vitest";
import { resolveScope } from "./scope";

const req = (qs: string) => new Request(`http://x/api${qs}`);

describe("resolveScope", () => {
  it("returns undefined scope when neither org nor user is set", () => {
    expect(resolveScope(req(""))).toEqual({ scope: undefined });
  });

  it("builds an org scope", () => {
    expect(resolveScope(req("?org=acme"))).toEqual({ scope: "org:acme" });
  });

  it("builds a user scope", () => {
    expect(resolveScope(req("?user=mfozmen"))).toEqual({ scope: "user:mfozmen" });
  });

  it("prefers user when both are present", () => {
    expect(resolveScope(req("?org=acme&user=mfozmen"))).toEqual({
      scope: "user:mfozmen",
    });
  });

  it("builds a repo scope", () => {
    expect(resolveScope(req("?repo=acme%2Fapi"))).toEqual({ scope: "repo:acme/api" });
  });

  // repo:owner/name already names its owner, so the narrower one wins rather
  // than the answer depending on which param the caller remembered to clear.
  it("prefers repo over both org and user", () => {
    expect(resolveScope(req("?org=acme&user=mfozmen&repo=beta%2Fweb"))).toEqual({
      scope: "repo:beta/web",
    });
  });

  it("rejects an invalid repo", () => {
    expect(resolveScope(req("?repo=acme"))).toEqual({ error: "invalid repo" });
  });

  it("rejects an invalid org", () => {
    expect(resolveScope(req("?org=bad%20name"))).toEqual({ error: "invalid org" });
  });

  it("rejects an invalid user", () => {
    expect(resolveScope(req("?user=bad%20name"))).toEqual({ error: "invalid user" });
  });
});
