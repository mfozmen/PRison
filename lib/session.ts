import { cookies } from "next/headers";
import { TOKEN_COOKIE, LOGIN_COOKIE, SIGNED_OUT_COOKIE, decryptToken, encryptToken, authSecret } from "./token-cookie";

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

/**
 * True between an explicit sign-out and the next sign-in. `app/page.tsx` reads it
 * to decide whether the env token may sign the user in automatically.
 *
 * Not an authorization boundary — a UX affordance. The env token lives on the host
 * and /api/token/env is already loopback-gated, so guarding that route with this
 * marker would only mean the "Sign in with the host token" button had to bypass it.
 */
export async function readSignedOut(): Promise<boolean> {
  return (await cookies()).get(SIGNED_OUT_COOKIE) !== undefined;
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
  // Signing in — by any route — re-arms the zero-config auto sign-in.
  store.delete(SIGNED_OUT_COOKIE);
}

export async function clearSession(): Promise<void> {
  const secure = process.env.NODE_ENV === "production";
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  store.delete(LOGIN_COOKIE);
  // No maxAge: a session cookie. Closing the browser restores the zero-config
  // auto sign-in, so a Docker instance stays one-command on the next visit.
  store.set(SIGNED_OUT_COOKIE, "1", {
    httpOnly: true, sameSite: "lax", secure, path: "/",
  });
}
