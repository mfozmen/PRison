import { ghClient } from "@/lib/github/client";
import { STUCK_PRS_QUERY, searchQuery, parseStuckPrs } from "@/lib/github/queries";
import { isValidLogin } from "@/lib/github/validate";
import { readToken } from "@/lib/session";

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  const org = new URL(request.url).searchParams.get("org") ?? "";
  if (org && !isValidLogin(org)) return new Response("invalid org", { status: 400 });
  try {
    const raw = await ghClient(token)(STUCK_PRS_QUERY, {
      q: searchQuery("author", org || undefined),
    });
    return Response.json(parseStuckPrs(raw));
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
