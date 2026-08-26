// Identity of this project itself — not to be confused with the GitHub
// repositories PRs belong to, which "repo" means everywhere else in here.
// Rendered by the header's version chip and by Settings → About, which must
// never disagree about where the project lives or which build is running.
export const PROJECT_URL = "https://github.com/mfozmen/PRison";

/** How the URL reads as link text — the scheme is noise on screen. */
export const PROJECT_LABEL = PROJECT_URL.replace("https://", "");

export function releaseUrl(version: string): string {
  return `${PROJECT_URL}/releases/tag/v${version}`;
}

// next.config.ts inlines this from package.json at build time; a dev build
// carries nothing, and both call sites drop their version line.
export function appVersion(): string | undefined {
  return process.env.NEXT_PUBLIC_APP_VERSION;
}

// Split out of PROJECT_URL rather than written again, so the update check can
// never end up asking GitHub about a different repository than the one the
// About pane links to.
const [owner, name] = PROJECT_URL.split("/").slice(-2);
export const PROJECT_OWNER = owner;
export const PROJECT_NAME = name;

/** Is `latest` a newer release than `current`?
 *
 * Compares the three numbers rather than the strings: "1.10.0" is newer than
 * "1.9.0" but sorts before it. Anything that isn't a plain `major.minor.patch`
 * — a prerelease suffix, a hand-typed tag, a dev build with no version at all
 * — answers no. An update prompt that can't tell should stay quiet rather than
 * send someone to a release page for nothing. */
export function isNewerVersion(latest: string, current: string): boolean {
  const parts = (v: string) => {
    const nums = v.replace(/^v/, "").split(".");
    if (nums.length !== 3) return null;
    const parsed = nums.map((n) => (/^\d+$/.test(n) ? Number(n) : Number.NaN));
    return parsed.some(Number.isNaN) ? null : parsed;
  };
  const a = parts(latest);
  const b = parts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
