import { cookies } from "next/headers";
import { TOKEN_COOKIE, LOGIN_COOKIE, decryptToken, encryptToken, authSecret } from "./token-cookie";

// Server-side readers for the GitHub PAT and the cached login handle. The token
// lives only in an encrypted httpOnly cookie and never reaches the browser.

export async function readToken(): Promise<string | null> {
  const enc = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!enc) return null;
  return decryptToken(enc, authSecret());
}

export async function readLogin(): Promise<string | null> {
  return (await cookies()).get(LOGIN_COOKIE)?.value ?? null;
}

// Cookie options (exact values — do not change)
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function setSession(token: string, login: string): Promise<void> {
  const secure = process.env.NODE_ENV === "production";
  const store = await cookies();
  store.set(TOKEN_COOKIE, encryptToken(token, authSecret()), {
    httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: MAX_AGE,
  });
  store.set(LOGIN_COOKIE, login, {
    httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  store.delete(LOGIN_COOKIE);
}
