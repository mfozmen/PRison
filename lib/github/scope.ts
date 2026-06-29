import { isValidLogin } from "./validate";

// Builds the GitHub search scope qualifier from the request's ?org= / ?user=
// params. Returns { scope } on success (scope is undefined when unscoped — the
// "All" view), or { error } with a message when a param is invalid. `user`
// wins if both are somehow present.
export function resolveScope(
  request: Request,
): { scope?: string } | { error: string } {
  const params = new URL(request.url).searchParams;
  const org = params.get("org") ?? "";
  const user = params.get("user") ?? "";
  if (org && !isValidLogin(org)) return { error: "invalid org" };
  if (user && !isValidLogin(user)) return { error: "invalid user" };
  return { scope: user ? `user:${user}` : org ? `org:${org}` : undefined };
}
