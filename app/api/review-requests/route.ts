import { ghQuery } from "@/lib/github/client";
import { REVIEW_REQUESTS_QUERY, searchQuery, parseReviewRequests } from "@/lib/github/queries";
import { resolveScope } from "@/lib/github/scope";
import { readToken, readLogin } from "@/lib/session";

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  const login = await readLogin();
  if (!login) return new Response("Unauthorized", { status: 401 });
  const scoped = resolveScope(request);
  if ("error" in scoped) return new Response(scoped.error, { status: 400 });
  try {
    const { data, partial } = await ghQuery(token, REVIEW_REQUESTS_QUERY, {
      q: searchQuery("review", scoped.scope),
    });
    return Response.json(parseReviewRequests(data, login), partial ? { headers: { "X-Partial": "1" } } : undefined);
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
