import { cookies } from "next/headers";
import { TOKEN_COOKIE, LOGIN_COOKIE, decryptToken, authSecret } from "./token-cookie";

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
