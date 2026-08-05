// release-it creates the GitHub release only when a token is in the
// environment. Without one it degrades to *printing* a web link: the version
// bump, changelog, commit, and tag all land, so the run looks successful — but
// `publish-image.yml` triggers on the `release` event, so no Docker image is
// ever built. That failure is quiet enough to miss, and it did get missed.
//
// `gh` is already a prerequisite here (RELEASING.md, the rollback commands, the
// image re-run), so take the token from it rather than trusting whoever runs
// the release to remember an environment variable. This file is JS rather than
// JSON for exactly this one reason.
import { execFileSync } from "node:child_process";

function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    // stderr is discarded, not inherited: `gh` writes its own diagnostics there
    // and we replace them with the line below. stdout carries the token and is
    // never logged.
    return execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

// A dry run writes nothing, so there is no half-state for the guard below to
// prevent — and RELEASING.md offers `--dry-run` as the way to see every step
// without touching anything, which has to keep working unauthenticated.
const dryRun = process.argv.includes("--dry-run") || process.argv.includes("-d");

const token = githubToken();
if (!token && !dryRun) {
  // Exit here rather than let release-it warn and carry on. A release without
  // a GitHub release is the broken half-state this file exists to prevent, and
  // stopping before anything is written leaves nothing to roll back.
  console.error(
    "No GitHub token available, so release-it could not create the release.\n" +
      "Run `gh auth login`, or export GITHUB_TOKEN yourself, then try again.",
  );
  process.exit(1);
}
// Only reachable with an empty token on a dry run, where there is nothing to
// authenticate — leave the variable alone rather than set it to "".
if (token) process.env.GITHUB_TOKEN = token;

const config = {
  git: {
    requireBranch: "main",
    requireCleanWorkingDir: true,
    requireUpstream: true,
    commitMessage: "chore: release v${version}",
    tagName: "v${version}",
    tagAnnotation: "Release v${version}",
  },
  github: {
    release: true,
    releaseName: "v${version}",
  },
  npm: {
    publish: false,
  },
  hooks: {
    "before:init": ["npm test", "npm run typecheck", "npm run lint"],
  },
  plugins: {
    "@release-it/conventional-changelog": {
      preset: "conventionalcommits",
      infile: "CHANGELOG.md",
    },
  },
};

export default config;
