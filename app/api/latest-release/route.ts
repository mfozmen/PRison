import { readToken } from "@/lib/session";
import { PROJECT_OWNER, PROJECT_NAME } from "@/lib/project";
import {
  readCachedRelease,
  writeCachedRelease,
  RELEASE_FRESH_FLOOR_MS,
  RELEASE_MAX_AGE_MS,
} from "@/lib/release-store";

/** The newest PRison there is, so a container can say it has fallen behind.
 *
 * Deliberately not a GraphQL query: that would spend from the same hourly
 * point budget the dashboard's own refresh runs on, and a version check has no
 * business competing with the user's work for it. The REST release endpoint is
 * public, so this goes out with no token at all — off the account's allowance
 * entirely, and answered from a day-long cache so six open tabs and a
 * restarted container are still one question a day.
 *
 * Signed in all the same: it is not the user's data, but an open proxy that
 * fetches on demand is not a thing to leave lying around.
 *
 * `?fresh=1` is the Settings button: an explicit question gets an answer from
 * GitHub, not from this morning (#112). It still refreshes the shared cache,
 * and still takes an answer under a minute old, so repeated clicks are one
 * request. The background check sends no flag and keeps its day. */
export async function GET(request?: Request) {
  if (!(await readToken())) return new Response("Unauthorized", { status: 401 });

  const fresh = request ? new URL(request.url).searchParams.get("fresh") === "1" : false;
  const cached = readCachedRelease(
    Date.now(),
    fresh ? RELEASE_FRESH_FLOOR_MS : RELEASE_MAX_AGE_MS,
  );
  if (cached) return Response.json({ tagName: cached.tagName });

  try {
    const res = await fetch(
      `https://api.github.com/repos/${PROJECT_OWNER}/${PROJECT_NAME}/releases/latest`,
      { headers: { accept: "application/vnd.github+json" } },
    );
    // 404 is an answer: this repository has published no release. Anything
    // else went wrong, and a wrong answer cached for a day is worse than none.
    if (res.status === 404) {
      writeCachedRelease({ tagName: null, fetchedAt: Date.now() });
      return Response.json({ tagName: null });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { tag_name: tagName } = (await res.json()) as { tag_name?: unknown };
    if (typeof tagName !== "string") throw new Error("no tag in the answer");
    writeCachedRelease({ tagName, fetchedAt: Date.now() });
    return Response.json({ tagName });
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
