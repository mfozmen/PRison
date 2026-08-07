import { ghQuery } from "@/lib/github/client";
import { REVIEWED_PRS_QUERY, searchQuery, parseReviewedPrs } from "@/lib/github/queries";
import { resolveScope } from "@/lib/github/scope";
import { readToken, readLogin } from "@/lib/session";

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  // reviews(author:) takes a literal login, so the query needs the viewer's
  // name — @me is a search-qualifier shorthand, not a GraphQL argument.
  const login = await readLogin();
  if (!login) return new Response("Unauthorized", { status: 401 });
  const scoped = resolveScope(request);
  if ("error" in scoped) return new Response(scoped.error, { status: 400 });
  try {
    const { data, partial } = await ghQuery(token, REVIEWED_PRS_QUERY, {
      q: searchQuery("reviewed", scoped.scope),
      login,
    });
    return Response.json(parseReviewedPrs(data), partial ? { headers: { "X-Partial": "1" } } : undefined);
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
