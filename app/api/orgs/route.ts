import { ghClient } from "@/lib/github/client";
import { ORGS_QUERY, parseOrgs } from "@/lib/github/queries";
import { readToken } from "@/lib/session";

export async function GET() {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  try {
    const raw = await ghClient(token)(ORGS_QUERY);
    return Response.json(parseOrgs(raw));
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
