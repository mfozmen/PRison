import { getToken } from "next-auth/jwt";
import { ghClient } from "@/lib/github/client";
import { REVIEW_REQUESTS_QUERY, searchQuery, parseReviewRequests } from "@/lib/github/queries";
import { isValidLogin } from "@/lib/github/validate";

export async function GET(request: Request) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token?.accessToken) return new Response("Unauthorized", { status: 401 });
  if (!token.login) return new Response("Unauthorized", { status: 401 });
  const org = new URL(request.url).searchParams.get("org");
  if (!org) return new Response("org required", { status: 400 });
  if (!isValidLogin(org)) return new Response("invalid org", { status: 400 });
  try {
    const raw = await ghClient(token.accessToken)(REVIEW_REQUESTS_QUERY, {
      q: searchQuery("review", org),
    });
    return Response.json(parseReviewRequests(raw, token.login));
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
