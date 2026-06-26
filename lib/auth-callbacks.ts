import type { Account, Profile, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

/**
 * NextAuth JWT callback. The GitHub access token is stored ONLY here, in the
 * JWT — an encrypted, httpOnly cookie that never reaches client JavaScript.
 * It is deliberately NOT copied onto the session (see {@link applySession}),
 * so it is never served to the browser via /api/auth/session or useSession().
 * Server-side code reads it with `getToken` from "next-auth/jwt". See design
 * spec §4.
 */
export function applyJwt({
  token,
  account,
  profile,
}: {
  token: JWT;
  account?: Account | null;
  profile?: Profile | null;
}): JWT {
  if (account) token.accessToken = account.access_token;
  if (profile) token.login = (profile as { login?: string }).login;
  return token;
}

/**
 * NextAuth session callback. Exposes ONLY the non-sensitive `login` handle to
 * the client. The access token is intentionally omitted and stays server-side
 * in the JWT (see {@link applyJwt}). See design spec §4.
 */
export function applySession({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}): Session {
  session.login = token.login;
  return session;
}
