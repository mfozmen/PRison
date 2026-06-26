import { getToken } from "next-auth/jwt";
import { ghClient } from "@/lib/github/client";
import { STUCK_PRS_QUERY, searchQuery, parseStuckPrs } from "@/lib/github/queries";
import { isValidLogin } from "@/lib/github/validate";

export async function GET(request: Request) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token?.accessToken) return new Response("Unauthorized", { status: 401 });
  const org = new URL(request.url).searchParams.get("org");
  if (!org) return new Response("org required", { status: 400 });
  if (!isValidLogin(org)) return new Response("invalid org", { status: 400 });
  try {
    const raw = await ghClient(token.accessToken)(STUCK_PRS_QUERY, {
      q: searchQuery("author", org),
    });
    return Response.json(parseStuckPrs(raw));
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
