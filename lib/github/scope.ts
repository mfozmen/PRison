import { isValidLogin, isValidRepo } from "./validate";

// Builds the GitHub search scope qualifier from the request's ?repo= / ?org= /
// ?user= params. Returns { scope } on success (scope is undefined when unscoped
// — the "All" view), or { error } with a message when a param is invalid.
//
// Precedence is repo, then user, then org. `repo:owner/name` already names its
// owner, so an org alongside it could only agree or contradict; picking the
// narrower one means the answer never depends on which of the two the caller
// remembered to clear.
export function resolveScope(
  request: Request,
): { scope?: string } | { error: string } {
  const params = new URL(request.url).searchParams;
  const org = params.get("org") ?? "";
  const user = params.get("user") ?? "";
  const repo = params.get("repo") ?? "";
  if (org && !isValidLogin(org)) return { error: "invalid org" };
  if (user && !isValidLogin(user)) return { error: "invalid user" };
  if (repo && !isValidRepo(repo)) return { error: "invalid repo" };
  let scope: string | undefined;
  if (repo) {
    scope = `repo:${repo}`;
  } else if (user) {
    scope = `user:${user}`;
  } else if (org) {
    scope = `org:${org}`;
  }
  return { scope };
}
