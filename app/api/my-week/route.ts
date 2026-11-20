import { budgetFrom, budgetHeaders } from "@/lib/github/budget";
import { upstreamErrorResponse } from "@/lib/github/errors";
import { ghQuery } from "@/lib/github/client";
import { MY_WEEK_QUERY, myWeekSearch, parseMyWeek } from "@/lib/github/queries";
import { resolveScope } from "@/lib/github/scope";
import { readToken, readLogin } from "@/lib/session";

// Fourteen days: this week and the one before it, to compare against.
const WINDOW_DAYS = 14;

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  const login = await readLogin();
  if (!login) return new Response("Unauthorized", { status: 401 });
  const scoped = resolveScope(request);
  if ("error" in scoped) return new Response(scoped.error, { status: 400 });
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  try {
    const { data, partial } = await ghQuery(token, MY_WEEK_QUERY, { q: myWeekSearch(since, scoped.scope) });
    return Response.json(parseMyWeek(data, login), {
      headers: budgetHeaders(budgetFrom(data), partial ? { "X-Partial": "1" } : {}),
    });
  } catch (e) {
    return upstreamErrorResponse(e);
  }
}
