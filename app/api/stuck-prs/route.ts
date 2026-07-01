import { ghQuery } from "@/lib/github/client";
import { STUCK_PRS_QUERY, searchQuery, parseStuckPrs } from "@/lib/github/queries";
import { resolveScope } from "@/lib/github/scope";
import { readToken } from "@/lib/session";

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  const scoped = resolveScope(request);
  if ("error" in scoped) return new Response(scoped.error, { status: 400 });
  try {
    const { data, partial } = await ghQuery(token, STUCK_PRS_QUERY, {
      q: searchQuery("author", scoped.scope),
    });
    return Response.json(parseStuckPrs(data), partial ? { headers: { "X-Partial": "1" } } : undefined);
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
