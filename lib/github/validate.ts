/** GitHub org/user login: 1–39 chars, alphanumeric or hyphen, no leading/trailing hyphen */
const GITHUB_LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export function isValidLogin(value: string): boolean {
  return GITHUB_LOGIN_RE.test(value);
}

/** GitHub repository name: 1–100 chars of letters, digits, dot, underscore or
 * hyphen. Looser than a login on purpose — "next.js" and "my_tool" are real
 * repositories and neither is a valid login, so reusing isValidLogin for the
 * name half would reject them. */
const GITHUB_REPO_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** "owner/name", the form GitHub search takes after `repo:`. Split on the first
 * slash only: a name cannot contain one, so a second slash means the value is
 * not a repository reference. */
export function isValidRepo(value: string): boolean {
  const parts = value.split("/");
  if (parts.length !== 2) return false;
  const [owner, name] = parts;
  // "." and ".." are legal against the character class and name nothing.
  if (name === "." || name === "..") return false;
  return isValidLogin(owner) && GITHUB_REPO_NAME_RE.test(name);
}
