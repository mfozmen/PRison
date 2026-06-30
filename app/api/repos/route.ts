import { ghQuery } from "@/lib/github/client";
import { REPO_SEARCH_QUERY, parseRepoSearch } from "@/lib/github/queries";
import { isValidLogin } from "@/lib/github/validate";
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

  // Scope to the user's own accounts (orgs + personal). `user:<login>` works for
  // both orgs and users in repo search and multiple are OR'd, so results are
  // limited to repos the user can access instead of random public matches.
  const owners = (searchParams.get("owners") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => isValidLogin(o));
  const scope =
    owners.length > 0 ? " " + owners.map((o) => `user:${o}`).join(" ") : "";

  const searchString = `${sanitized} in:name fork:true${scope}`;

  try {
    const raw = await ghQuery(token, REPO_SEARCH_QUERY, { q: searchString });
    return Response.json(parseRepoSearch(raw));
  } catch {
    return new Response("Upstream GitHub error", { status: 502 });
  }
}
