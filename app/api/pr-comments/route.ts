import { ghQuery } from "@/lib/github/client";
import { PR_COMMENTS_QUERY, searchQuery, parsePrComments } from "@/lib/github/queries";
import { resolveScope } from "@/lib/github/scope";
import { readToken, readLogin } from "@/lib/session";

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  // parsePrComments needs the viewer's login to tell "someone is waiting on me"
  // from "I already replied".
  const login = await readLogin();
  if (!login) return new Response("Unauthorized", { status: 401 });
  const scoped = resolveScope(request);
  if ("error" in scoped) return new Response(scoped.error, { status: 400 });
  try {
    // Two searches, because "waiting on my reply" has two shapes. On the
    // viewer's own PRs any unanswered thread is theirs; on a PR they reviewed,
    // only the threads they raised — and those never appeared here before,
    // which is why a reply to your own review comment went unnoticed.
    const [own, reviewed] = await Promise.all([
      ghQuery(token, PR_COMMENTS_QUERY, { q: searchQuery("author", scoped.scope) }),
      ghQuery(token, PR_COMMENTS_QUERY, { q: searchQuery("reviewed", scoped.scope) }),
    ]);
    const comments = [
      ...parsePrComments(own.data, login),
      ...parsePrComments(reviewed.data, login, true),
    ];
    // A PR can match both searches only if the viewer reviewed their own PR,
    // which GitHub forbids — but the thread id is the natural key either way,
    // and a duplicated row would render twice and double-count.
    const deduped = [...new Map(comments.map((c) => [c.id, c])).values()];
    const partial = own.partial || reviewed.partial;
    return Response.json(deduped, partial ? { headers: { "X-Partial": "1" } } : undefined);
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
