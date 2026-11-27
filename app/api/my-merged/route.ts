import { budgetFrom, budgetHeaders } from "@/lib/github/budget";
import { upstreamErrorResponse } from "@/lib/github/errors";
import { ghQuery } from "@/lib/github/client";
import { MY_MERGED_QUERY, myMergedSearch, parseMyMerged } from "@/lib/github/queries";
import { resolveScope } from "@/lib/github/scope";
import { readToken } from "@/lib/session";

// This week and the one before it, plus a day: the search takes a UTC date, so
// the extra day keeps the oldest hours of last week inside it wherever you are.
const WINDOW_DAYS = 15;

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  const scoped = resolveScope(request);
  if ("error" in scoped) return new Response(scoped.error, { status: 400 });
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  try {
    const { data, partial } = await ghQuery(token, MY_MERGED_QUERY, { q: myMergedSearch(since, scoped.scope) });
    return Response.json(parseMyMerged(data), {
      headers: budgetHeaders(budgetFrom(data), partial ? { "X-Partial": "1" } : {}),
    });
  } catch (e) {
    return upstreamErrorResponse(e);
  }
}
