import { budgetHeaders } from "@/lib/github/budget";
import { upstreamErrorResponse } from "@/lib/github/errors";
import { ghQuery } from "@/lib/github/client";
import { CLOSED_PRS_QUERY, searchQuery, parseClosedPrs } from "@/lib/github/queries";
import { resolveScope } from "@/lib/github/scope";
import { readToken } from "@/lib/session";

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  const scoped = resolveScope(request);
  if ("error" in scoped) return new Response(scoped.error, { status: 400 });
  try {
    const { data, partial } = await ghQuery(token, CLOSED_PRS_QUERY, {
      q: searchQuery("closed", scoped.scope),
    });
    return Response.json(parseClosedPrs(data), {
      headers: budgetHeaders(data, partial ? { "X-Partial": "1" } : {}),
    });
  } catch (e) {
    return upstreamErrorResponse(e);
  }
}
