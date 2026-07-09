# Releasing

PRison uses [release-it](https://github.com/release-it/release-it). One command
bumps the version, writes the changelog, tags, and publishes a GitHub release —
which in turn builds and pushes the Docker image.

## Before you start

- You are on `main`, up to date with `origin`, with a clean working tree.
  release-it refuses otherwise (`requireBranch`, `requireCleanWorkingDir`,
  `requireUpstream`).
- `GITHUB_TOKEN` is exported, so release-it can create the GitHub release.
- The repo secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` exist, or the image
  workflow will fail after the release lands.

## Cut a release

```sh
GITHUB_TOKEN="$(gh auth token)" npx release-it
```

For the **first** release, name the version explicitly:

```sh
GITHUB_TOKEN="$(gh auth token)" npx release-it 1.0.0
```

Add `--dry-run` to see every step without touching anything.

## What it does, in order

1. Runs `npm test`, `npm run typecheck`, and `npm run lint` (`hooks.before:init`)
   — the same scripts CI runs, not a second copy of the commands. A failure stops
   the release before anything is written: no bump, no tag, no push.
2. Bumps `version` in `package.json`.
3. Regenerates `CHANGELOG.md` from the commit subjects since the last tag. The
   repo writes `feat:` / `fix:` / `chore:` subjects, so the changelog needs no
   extra bookkeeping.
4. Commits `chore: release v<version>` and tags it `v<version>`.
5. Pushes both to `main` — **directly**, not through a pull request. The branch
   ruleset requires an approving review, and the push clears it via the
   repository-admin bypass. This is the one place `main` is written without a PR.
6. Creates the GitHub release, which fires `.github/workflows/publish-image.yml`
   and pushes `mfozmen/prison:<version>` and `:latest` to Docker Hub.

## Where the version shows up

`next.config.ts` reads `version` from `package.json` at build time and inlines it
as `NEXT_PUBLIC_APP_VERSION`. The `Header` renders it next to Sign Out, linking to
the release tag. **`package.json` is the only source of truth** — do not write the
version anywhere else, and do not read `process.env.npm_package_version`, which is
set only when the build runs through an npm script.

A build with no version renders no version. It never renders `vundefined`.

## Rolling one back

Nothing is irreversible until the Docker image is pulled by someone.

```sh
git push --delete origin v1.2.0      # remove the tag
gh release delete v1.2.0 --yes       # remove the GitHub release
git revert <sha-of-release-commit>   # undo the bump + changelog
```

Then delete the tag on Docker Hub. Note that **deleting a tag does not retract the
image layers** — anyone who pulled it still has it. Treat a bad release as
published and fix forward with a new version.
