import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { applyJwt, applySession } from "@/lib/auth-callbacks";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: { params: { scope: "read:org repo" } },
    }),
  ],
  // The access token is kept server-side in the JWT only and is never copied
  // onto the session, so it is never exposed to the browser via
  // /api/auth/session. The token-isolation contract is unit-tested in
  // lib/auth-callbacks.test.ts. See design spec §4.
  callbacks: {
    jwt: applyJwt,
    session: applySession,
  },
});
