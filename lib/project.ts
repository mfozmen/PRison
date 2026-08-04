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
