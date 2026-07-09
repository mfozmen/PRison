import { describe, it, expect, vi, beforeEach } from "vitest";
import { encryptToken, decryptToken, TOKEN_COOKIE, LOGIN_COOKIE, SIGNED_OUT_COOKIE } from "./token-cookie";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

import { readToken, readLogin, readSignedOut, setSession, clearSession } from "./session";

beforeEach(() => {
  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
  cookieStore.delete.mockReset();
  process.env.AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaa";
});

describe("readToken", () => {
  it("returns null when the cookie is absent", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await readToken()).toBeNull();
  });

  it("decrypts the stored token", async () => {
    const enc = encryptToken("ghp_secret", process.env.AUTH_SECRET as string);
    cookieStore.get.mockImplementation((name: string) =>
      name === TOKEN_COOKIE ? { value: enc } : undefined,
    );
    expect(await readToken()).toBe("ghp_secret");
  });
});

describe("readLogin", () => {
  it("returns the login cookie value, or null", async () => {
    cookieStore.get.mockImplementation((name: string) =>
      name === LOGIN_COOKIE ? { value: "mfozmen" } : undefined,
    );
    expect(await readLogin()).toBe("mfozmen");
    cookieStore.get.mockReturnValue(undefined);
    expect(await readLogin()).toBeNull();
  });
});

describe("readSignedOut", () => {
  it("is true only while the marker cookie is present", async () => {
    cookieStore.get.mockImplementation((name: string) =>
      name === SIGNED_OUT_COOKIE ? { value: "1" } : undefined,
    );
    expect(await readSignedOut()).toBe(true);
    cookieStore.get.mockReturnValue(undefined);
    expect(await readSignedOut()).toBe(false);
  });
});

describe("setSession", () => {
  // Signing in — by any route — re-arms the zero-config auto sign-in.
  it("clears the signed-out marker", async () => {
    await setSession("ghp_secret", "mfozmen");
    expect(cookieStore.delete).toHaveBeenCalledWith(SIGNED_OUT_COOKIE);
  });

  it("stores the login plainly and the token encrypted, both httpOnly", async () => {
    await setSession("ghp_secret", "mfozmen");

    expect(cookieStore.set).toHaveBeenCalledTimes(2);
    const tokenCall = cookieStore.set.mock.calls.find(
      (c) => c[0] === TOKEN_COOKIE,
    );
    const loginCall = cookieStore.set.mock.calls.find(
      (c) => c[0] === LOGIN_COOKIE,
    );

    // The token cookie holds the ciphertext, never the raw token, and round-trips.
    expect(tokenCall?.[1]).not.toContain("ghp_secret");
    expect(decryptToken(tokenCall?.[1] as string, process.env.AUTH_SECRET as string)).toBe(
      "ghp_secret",
    );
    expect(tokenCall?.[2]).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });

    // The login cookie holds the plain handle.
    expect(loginCall?.[1]).toBe("mfozmen");
    expect(loginCall?.[2]).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });
});

describe("clearSession", () => {
  it("deletes both the token and login cookies", async () => {
    await clearSession();
    expect(cookieStore.delete).toHaveBeenCalledTimes(2);
    expect(cookieStore.delete).toHaveBeenCalledWith(TOKEN_COOKIE);
    expect(cookieStore.delete).toHaveBeenCalledWith(LOGIN_COOKIE);
  });

  // Without this, page.tsx renders EnvSignIn on the very next request and signs
  // the user straight back in — sign-out and sign-in become one page load.
  it("sets the signed-out marker as a session cookie (no maxAge)", async () => {
    await clearSession();
    const marker = cookieStore.set.mock.calls.find((c) => c[0] === SIGNED_OUT_COOKIE);
    expect(marker?.[1]).toBe("1");
    expect(marker?.[2]).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(marker?.[2]).not.toHaveProperty("maxAge");
  });
});
