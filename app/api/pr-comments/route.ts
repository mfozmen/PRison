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
  // Two searches, because "waiting on my reply" has two shapes. On the viewer's
  // own PRs any unanswered thread is theirs; on a PR they reviewed, only the
  // threads they raised — and those never appeared here before, which is why a
  // reply to your own review comment went unnoticed.
  //
  // allSettled, not all: before the reviewed leg existed this list depended on
  // one query, and a blip on the new one must not take the old one down with
  // it. It also makes the try/catch every sibling route needs unnecessary —
  // neither leg can reject past this point.
  const [own, reviewed] = await Promise.allSettled([
    ghQuery(token, PR_COMMENTS_QUERY, { q: searchQuery("author", scoped.scope) }),
    ghQuery(token, PR_COMMENTS_QUERY, { q: searchQuery("reviewed", scoped.scope) }),
  ]);
  // Both down is an upstream outage, not partial data.
  if (own.status === "rejected" && reviewed.status === "rejected") {
    return new Response("Upstream GitHub error", { status: 502 });
  }
  const comments = [
    ...(own.status === "fulfilled" ? parsePrComments(own.value.data, login) : []),
    ...(reviewed.status === "fulfilled"
      ? parsePrComments(reviewed.value.data, login, true)
      : []),
  ];
  // The reviewed search excludes the viewer's own PRs, so a thread can only come
  // back once — but the thread id is the natural key either way, and a
  // duplicated row would render twice and double-count.
  const deduped = [...new Map(comments.map((c) => [c.id, c])).values()];
  // A leg that never answered is missing data — exactly what X-Partial says.
  const partial =
    own.status === "rejected" ||
    reviewed.status === "rejected" ||
    own.value.partial ||
    reviewed.value.partial;
  return Response.json(deduped, partial ? { headers: { "X-Partial": "1" } } : undefined);
}
