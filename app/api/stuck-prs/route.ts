import { ghQuery } from "@/lib/github/client";
import { STUCK_PRS_QUERY, searchQuery, parseStuckPrs } from "@/lib/github/queries";
import { isValidLogin } from "@/lib/github/validate";
import { readToken } from "@/lib/session";

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  const params = new URL(request.url).searchParams;
  const org = params.get("org") ?? "";
  const user = params.get("user") ?? "";
  if (org && !isValidLogin(org)) return new Response("invalid org", { status: 400 });
  if (user && !isValidLogin(user)) return new Response("invalid user", { status: 400 });
  // If both org and user are somehow present, user wins.
  const scope = user ? `user:${user}` : org ? `org:${org}` : undefined;
  try {
    const raw = await ghQuery(token, STUCK_PRS_QUERY, {
      q: searchQuery("author", scope),
    });
    return Response.json(parseStuckPrs(raw));
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
