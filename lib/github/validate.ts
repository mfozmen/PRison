/** GitHub org/user login: 1–39 chars, alphanumeric or hyphen, no leading/trailing hyphen */
const GITHUB_LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export function isValidLogin(value: string): boolean {
  return GITHUB_LOGIN_RE.test(value);
}
