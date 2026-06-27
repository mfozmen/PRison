import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken, authSecret } from "./token-cookie";

const SECRET = "test-secret-00000000000000000000";

describe("authSecret", () => {
  it("returns AUTH_SECRET when set", () => {
    process.env.AUTH_SECRET = SECRET;
    expect(authSecret()).toBe(SECRET);
  });
  it("throws when AUTH_SECRET is missing", () => {
    delete process.env.AUTH_SECRET;
    expect(() => authSecret()).toThrow(/AUTH_SECRET/);
  });
});

describe("token cookie encryption", () => {
  it("round-trips a token", () => {
    const enc = encryptToken("ghp_example123", SECRET);
    expect(enc).not.toContain("ghp_example123");
    expect(decryptToken(enc, SECRET)).toBe("ghp_example123");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptToken("x", SECRET)).not.toBe(encryptToken("x", SECRET));
  });

  it("returns null for a wrong secret", () => {
    const enc = encryptToken("ghp_example123", SECRET);
    expect(decryptToken(enc, "another-secret-000000000000000000")).toBeNull();
  });

  it("returns null for a tampered or malformed value", () => {
    expect(decryptToken("not.a.valid", SECRET)).toBeNull();
    expect(decryptToken("garbage", SECRET)).toBeNull();
    expect(decryptToken("", SECRET)).toBeNull();
  });
});
