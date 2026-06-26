import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    // The access token is intentionally NOT on the session — it stays in the
    // JWT (server-side only). See design spec §4 and auth.ts callbacks.
    login?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    login?: string;
  }
}
