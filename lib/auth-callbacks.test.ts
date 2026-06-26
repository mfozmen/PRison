import { describe, it, expect } from "vitest";
import type { Account, Profile, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { applyJwt, applySession } from "./auth-callbacks";

describe("applyJwt", () => {
  it("stores the access token from the account on the JWT", () => {
    const token: JWT = {};
    const account = { access_token: "gho_secret" } as Account;

    const result = applyJwt({ token, account });

    expect(result.accessToken).toBe("gho_secret");
  });

  it("stores the login handle from the profile on the JWT", () => {
    const token: JWT = {};
    const profile = { login: "octocat" } as unknown as Profile;

    const result = applyJwt({ token, profile });

    expect(result.login).toBe("octocat");
  });

  it("leaves the token unchanged when neither account nor profile is present", () => {
    const token: JWT = { accessToken: "existing", login: "octocat" };

    const result = applyJwt({ token });

    expect(result.accessToken).toBe("existing");
    expect(result.login).toBe("octocat");
  });
});

describe("applySession", () => {
  it("exposes only the login handle on the session", () => {
    const session = {} as Session;
    const token: JWT = { login: "octocat" };

    const result = applySession({ session, token });

    expect(result.login).toBe("octocat");
  });

  it("never leaks the access token onto the session (token-isolation contract)", () => {
    const session = {} as Session;
    const token: JWT = { accessToken: "gho_secret", login: "octocat" };

    const result = applySession({ session, token });

    // Security invariant (design spec §4): the access token must stay in the
    // JWT and never be copied onto the client-facing session.
    expect((result as unknown as Record<string, unknown>).accessToken).toBeUndefined();
    expect("accessToken" in result).toBe(false);
  });
});
