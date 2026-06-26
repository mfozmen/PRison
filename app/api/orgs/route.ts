import { getToken } from "next-auth/jwt";
import { ghClient } from "@/lib/github/client";
import { ORGS_QUERY, parseOrgs } from "@/lib/github/queries";

export async function GET(request: Request) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token?.accessToken) return new Response("Unauthorized", { status: 401 });
  try {
    const raw = await ghClient(token.accessToken)(ORGS_QUERY);
    return Response.json(parseOrgs(raw));
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
