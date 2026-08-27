import { isLoopback } from "@/lib/loopback";
import { readToken } from "@/lib/session";
import { readStoredInterval, writeStoredInterval } from "@/lib/poll-interval-store";

/** How often the dashboard refreshes, for readers that are not the dashboard.
 *
 * The menu-bar plugin is a shell script: it cannot see localStorage, and a
 * schedule of its own is how two clients on one account spend an hourly budget
 * twice. Local-only and unauthenticated, because a poll interval is a
 * preference rather than anyone's data, and requiring a session would cost the
 * plugin a GitHub query every time it asks whether it is even due. */
export async function GET(request: Request) {
  if (!isLoopback(request)) {
    return Response.json({ reason: "not-local" }, { status: 403 });
  }
  return Response.json({ ms: readStoredInterval() });
}

/** Written by the dashboard when the user picks an interval. Signed in, since
 * this changes what the machine does while nobody is watching. */
export async function PUT(request: Request) {
  if (!(await readToken())) return new Response("Unauthorized", { status: 401 });
  let ms: unknown;
  try {
    ({ ms } = (await request.json()) as { ms?: unknown });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (typeof ms !== "number" || !writeStoredInterval(ms)) {
    return new Response("Not an offered interval", { status: 400 });
  }
  return new Response(null, { status: 204 });
}
