// Where this project lives. Rendered in two places — the header's version
// chip and Settings → About — which must never point at different repos.
export const REPO_URL = "https://github.com/mfozmen/PRison";

export function releaseUrl(version: string): string {
  return `${REPO_URL}/releases/tag/v${version}`;
}
