import crypto from "node:crypto";

// The GitHub Personal Access Token is stored in an httpOnly cookie, encrypted
// at rest with AES-256-GCM so a leaked cookie store does not expose the raw
// token. The key is derived from AUTH_SECRET.

const ALG = "aes-256-gcm";

export const TOKEN_COOKIE = "prison_token";
export const LOGIN_COOKIE = "prison_login";

function keyFrom(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

// Fail fast rather than silently encrypting with a publicly-known empty key.
export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET must be set");
  return s;
}

export function encryptToken(plain: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, keyFrom(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(value: string, secret: string): string | null {
  try {
    const [ivB, tagB, encB] = value.split(".");
    if (!ivB || !tagB || !encB) return null;
    const decipher = crypto.createDecipheriv(
      ALG,
      keyFrom(secret),
      Buffer.from(ivB, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(encB, "base64url")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
