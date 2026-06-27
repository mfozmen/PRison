import { cookies } from "next/headers";
import { ghClient } from "@/lib/github/client";
import { VIEWER_QUERY } from "@/lib/github/queries";
import { TOKEN_COOKIE, LOGIN_COOKIE, encryptToken, authSecret } from "@/lib/token-cookie";

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Accepts a GitHub Personal Access Token, validates it by resolving the viewer,
// and stores it in an encrypted httpOnly cookie. The raw token never reaches
// the browser.
export async function POST(request: Request) {
  let token: unknown;
  try {
    ({ token } = await request.json());
  } catch {
    return new Response("Invalid body", { status: 400 });
  }
  if (typeof token !== "string" || token.trim() === "") {
    return new Response("Token required", { status: 400 });
  }

  let login: string;
  try {
    const raw = (await ghClient(token.trim())(VIEWER_QUERY)) as {
      viewer?: { login?: string };
    };
    if (!raw?.viewer?.login) {
      return new Response("Token has no access", { status: 401 });
    }
    login = raw.viewer.login;
  } catch {
    return new Response("Invalid token", { status: 401 });
  }

  const secure = process.env.NODE_ENV === "production";
  const store = await cookies();
  store.set(TOKEN_COOKIE, encryptToken(token.trim(), authSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: MAX_AGE,
  });
  store.set(LOGIN_COOKIE, login, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: MAX_AGE,
  });
  return Response.json({ login });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  store.delete(LOGIN_COOKIE);
  return new Response(null, { status: 204 });
}
