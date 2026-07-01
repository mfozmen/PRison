import { isLoopback } from "@/lib/loopback";
import { ghClient } from "@/lib/github/client";
import { VIEWER_QUERY } from "@/lib/github/queries";
import { setSession } from "@/lib/session";

export async function POST(request: Request) {
  if (!isLoopback(request)) {
    return Response.json({ reason: "not-local" }, { status: 403 });
  }

  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    return Response.json({ reason: "no-env-token" }, { status: 404 });
  }

  let login: string;
  try {
    const raw = (await ghClient(token)(VIEWER_QUERY)) as { viewer?: { login?: string } };
    if (!raw?.viewer?.login) {
      return Response.json({ reason: "token-rejected" }, { status: 401 });
    }
    login = raw.viewer.login;
  } catch {
    return Response.json({ reason: "token-rejected" }, { status: 401 });
  }

  await setSession(token, login);
  return Response.json({ login });
}
