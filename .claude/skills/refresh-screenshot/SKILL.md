---
name: refresh-screenshot
description: Regenerate docs/screenshot.png from synthetic data. Use when the dashboard UI changed and the README screenshot no longer shows it — a new filter, a new section, a restyled card — and as part of shipping any such PR, before merging and before a release. Drives headless Chrome from a script; never captures real GitHub data.
---

# Refreshing docs/screenshot.png

## When this is part of the job, not a separate request

Any PR that changes what the board **looks like** — a new control in the filter
bar, a new section, a moved column, a restyled card, a new badge — is not
finished until this has run. The screenshot is the first thing anyone sees on
the README, and a shot that predates the control is a bug report waiting to be
filed. Do it **on the feature branch before merging**, so the README and the
picture ship together; a release cut over a stale screenshot publishes the old
board to Docker Hub and the repo page at once.

Check this before every merge and every release, without being asked: if the
diff touched a component that renders, open `docs/screenshot.png` and see
whether it still matches. If the composition changed, the alt text on line 38
of the README changes with it.

The README screenshot goes stale every time the dashboard gains a control. Two
files do the whole job:

- `scripts/screenshot/demo-board.mjs` — the synthetic board, one array per list.
- `scripts/screenshot/capture.mjs` — headless Chrome over the DevTools Protocol.

## The rule this exists for

PRison is public. Anything visible in `docs/screenshot.png` is published, so the
board must come from `demo-board.mjs`, which is built from the same allowlisted
names (`acme`, `globex`, `initech`, `widgets-inc`, `alice`, `bob`, `carol`,
`dave`, `octocat`) that `lib/generic-fixtures.ts` enforces everywhere else.

**Never screenshot a signed-in board showing real data**, not even to "check the
layout" — a real PR title in a discarded screenshot is still a real PR title
that reached the disk of a public checkout.

The capture script is built so that cannot happen by accident: it mints its own
session cookie carrying a **deliberately invalid token**, so the shell renders
and the org query returns nothing, and it patches `window.fetch` before the
first paint so no list ever reaches GitHub.

## Steps

### 1. Start the dev server

```bash
npm run dev
```

`docs/screenshot.png` is not reachable from a production build without a real
token, which is the thing this must not use. Note the port it actually picked:
if the Docker container is on `:3000` — and it holds **real** data — `next dev`
falls back to `:3001` and you must point the capture at that one.

### 2. Capture

```bash
node scripts/screenshot/capture.mjs                        # localhost:3000
PRISON_URL=http://localhost:3001 node scripts/screenshot/capture.mjs
```

It writes `docs/screenshot.png` directly, at 1280 CSS px and 2x, dark theme,
full page. Nothing to click, no browser to drive. Chrome runs headless on a
throwaway profile, so your own browser is untouched; set `CHROME_PATH` if Chrome
is not at the default macOS location.

Give it a minute. Chrome's first headless start on a managed machine can take
well over the usual couple of seconds.

If it fails with "the dashboard did not render", the dev server is not up at the
URL you passed. If it fails on `AUTH_SECRET`, run `npm run dev` once so
`.env.local` gets written.

### 3. Check before committing

- Open the PNG and **read every string in it**. Any repository, org, person, or
  PR title that is not from the demo board is a leak.
- Make sure the control the screenshot exists to show is visible and in a state
  that demonstrates it — default state unless the exotic one is the point.
- If the composition changed enough that the README's alt text no longer
  describes it, update the alt text too.
- `npx vitest run lib/generic-fixtures.test.ts` — the guard scans committed
  files and commit messages, so it catches a name that reached the demo board
  itself, though it cannot read the pixels.

## Changing what the board shows

Edit `scripts/screenshot/demo-board.mjs`. It is plain data in the shapes
`lib/types.ts` defines, one array per list, and the only rules are:

- Names come from the allowlist above — **both halves** of `org/repo`, which is
  the one that trips people up. If you need a new one, add it to the allowlist
  in `lib/generic-fixtures.ts` first, and pick something obviously fictional.
- Keep at least one draft in the lists that can hold one, so the draft filter
  has something to act on.
- Keep the mix that makes the board legible: something failing, something
  pending, something approved and waiting, something merged.

Ages are written as `ago(hours)` and resolve at run time, so the badges read
`2h` / `3d` instead of freezing at the date the file was written.

## Changing the shot itself

`capture.mjs` is a small CDP client — `send(method, params)` returns the result.
The knobs worth knowing:

- `WIDTH` / `SCALE` at the top.
- The `Page.addScriptToEvaluateOnNewDocument` source seeds `localStorage`
  (theme, draft filter), installs the fetch patch, and hides the `nextjs-portal`
  dev overlay. Anything that must be true before the first paint goes there.
- The 3 s settle before capture covers React's commit and the age badges.
