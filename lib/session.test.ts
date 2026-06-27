import { describe, it, expect, vi, beforeEach } from "vitest";
import { encryptToken, TOKEN_COOKIE, LOGIN_COOKIE } from "./token-cookie";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

import { readToken, readLogin } from "./session";

beforeEach(() => {
  cookieStore.get.mockReset();
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
