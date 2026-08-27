import { upstreamErrorResponse } from "@/lib/github/errors";
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
  // Who opened a thread is what the query costs, and this is the heaviest query
  // in the app — so only the leg that filters on it asks for it. Held once for
  // both the fetch and the parse below: two booleans that disagreed would drop
  // every thread and report an empty list rather than an error.
  const STARTER = { own: false, reviewed: true } as const;
  // Review bodies are the mirror image: they only make sense on the viewer's own
  // PRs, where an unanswered one is theirs to answer. Not the inverse of STARTER
  // by coincidence — asked as its own flag so a later leg can set them freely.
  const REVIEWS = { own: true, reviewed: false } as const;
  const [own, reviewed] = await Promise.allSettled([
    ghQuery(token, PR_COMMENTS_QUERY, {
      q: searchQuery("author", scoped.scope),
      withStarter: STARTER.own,
      withReviews: REVIEWS.own,
    }),
    ghQuery(token, PR_COMMENTS_QUERY, {
      q: searchQuery("reviewed", scoped.scope),
      withStarter: STARTER.reviewed,
      withReviews: REVIEWS.reviewed,
    }),
  ]);
  // Both down is an upstream outage, not partial data — and when the outage is
  // a spent hourly budget, saying so is the difference between a board that
  // explains itself and one that looks broken.
  if (own.status === "rejected" && reviewed.status === "rejected") {
    return upstreamErrorResponse(own.reason, reviewed.reason);
  }
  const comments = [
    ...(own.status === "fulfilled"
      ? parsePrComments(own.value.data, login, STARTER.own)
      : []),
    ...(reviewed.status === "fulfilled"
      ? parsePrComments(reviewed.value.data, login, STARTER.reviewed)
      : []),
  ];
  // The reviewed search excludes the viewer's own PRs, so a thread can only come
  // back once — but the thread id is the natural key either way, and a
  // duplicated row would render twice and double-count.
  const deduped = [...new Map(comments.map((c) => [c.id, c])).values()];
  // Two different kinds of missing, and the client acts on them differently.
  // X-Incomplete means a whole search never answered, so this list is a
  // truncated view of one that exists — a silent poll must not overwrite what
  // is on screen with it. X-Partial is GitHub degrading the data it did
  // return (an org the token cannot fully see), which can be the steady state
  // for an account and must not freeze the list forever.
  const incomplete = own.status === "rejected" || reviewed.status === "rejected";
  const partial =
    incomplete ||
    (own.status === "fulfilled" && own.value.partial) ||
    (reviewed.status === "fulfilled" && reviewed.value.partial);
  if (!partial) return Response.json(deduped);
  const headers: Record<string, string> = { "X-Partial": "1" };
  if (incomplete) headers["X-Incomplete"] = "1";
  return Response.json(deduped, { headers });
}
