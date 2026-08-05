import { ghQuery } from "@/lib/github/client";
import { LATEST_RELEASE_QUERY, parseLatestRelease } from "@/lib/github/queries";
import { readToken } from "@/lib/session";
import { PROJECT_OWNER, PROJECT_NAME } from "@/lib/project";

// The check goes through the server like every other GitHub call, so the
// browser still never talks to GitHub and the request is authenticated —
// an unauthenticated one would share a 60-per-hour budget with everything
// else on the same IP.
export async function GET() {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  try {
    const { data } = await ghQuery(token, LATEST_RELEASE_QUERY, {
      owner: PROJECT_OWNER,
      name: PROJECT_NAME,
    });
    return Response.json({ tagName: parseLatestRelease(data) ?? null });
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
