import { ghClient } from "@/lib/github/client";
import { VIEWER_QUERY } from "@/lib/github/queries";
import { setSession, clearSession } from "@/lib/session";

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

  await setSession(token.trim(), login);
  return Response.json({ login });
}

export async function DELETE() {
  await clearSession();
  return new Response(null, { status: 204 });
}
