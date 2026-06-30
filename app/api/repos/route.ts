import { ghQuery } from "@/lib/github/client";
import { REPO_SEARCH_QUERY, parseRepoSearch } from "@/lib/github/queries";
import { readToken } from "@/lib/session";

export async function GET(request: Request) {
  const token = await readToken();
  if (!token) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const rawQ = (searchParams.get("q") ?? "").trim();

  // Sanitize first (strip control characters, cap length), THEN gate on length,
  // so a control-char-only string can't slip past the < 2 guard and degenerate
  // into a bare " in:name fork:true" search.
  const sanitized = rawQ.replace(/[\x00-\x1F\x7F]/g, "").slice(0, 100);
  if (sanitized.length < 2) return Response.json([]);

  const searchString = `${sanitized} in:name fork:true`;

  try {
    const raw = await ghQuery(token, REPO_SEARCH_QUERY, { q: searchString });
    return Response.json(parseRepoSearch(raw));
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
