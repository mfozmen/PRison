import { ghClient } from "@/lib/github/client";
import { REVIEW_REQUESTS_QUERY, searchQuery, parseReviewRequests } from "@/lib/github/queries";
import { isValidLogin } from "@/lib/github/validate";
import { readToken, readLogin } from "@/lib/session";

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  const login = await readLogin();
  if (!login) return new Response("Unauthorized", { status: 401 });
  const org = new URL(request.url).searchParams.get("org") ?? "";
  if (org && !isValidLogin(org)) return new Response("invalid org", { status: 400 });
  try {
    const raw = await ghClient(token)(REVIEW_REQUESTS_QUERY, {
      q: searchQuery("review", org || undefined),
    });
    return Response.json(parseReviewRequests(raw, login));
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
