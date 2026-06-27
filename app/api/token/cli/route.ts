import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { ghClient } from "@/lib/github/client";
import { VIEWER_QUERY } from "@/lib/github/queries";
import { setSession } from "@/lib/session";

const execFile = promisify(execFileCb);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export async function POST(request: Request) {
  // This mints a session from the host's `gh` credentials, so restrict it to a
  // loopback origin — the intended local, single-user use. A networked instance
  // (a different host) must use a pasted token instead.
  if (!LOCAL_HOSTS.has(new URL(request.url).hostname)) {
    return new Response("GitHub CLI sign-in is only available locally", {
      status: 403,
    });
  }

  let token: string;
  try {
    const { stdout } = await execFile("gh", ["auth", "token"], {
      timeout: 5000,
      shell: false,
    });
    token = stdout.trim();
  } catch {
    return new Response("GitHub CLI is not available or not signed in", { status: 503 });
  }

  if (!token) {
    return new Response("GitHub CLI is not available or not signed in", { status: 503 });
  }

  let login: string;
  try {
    const raw = (await ghClient(token)(VIEWER_QUERY)) as {
      viewer?: { login?: string };
    };
    if (!raw?.viewer?.login) {
      return new Response("Token has no access", { status: 401 });
    }
    login = raw.viewer.login;
  } catch {
    return new Response("Invalid token", { status: 401 });
  }

  await setSession(token, login);
  return Response.json({ login });
}
