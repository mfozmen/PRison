import { ghQuery } from "@/lib/github/client";
import { READY_PRS_QUERY, searchQuery, parseReadyPrs } from "@/lib/github/queries";
import { resolveScope } from "@/lib/github/scope";
import { readToken } from "@/lib/session";

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  const scoped = resolveScope(request);
  if ("error" in scoped) return new Response(scoped.error, { status: 400 });
  try {
    const raw = await ghQuery(token, READY_PRS_QUERY, {
      q: searchQuery("ready", scoped.scope),
    });
    return Response.json(parseReadyPrs(raw));
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
