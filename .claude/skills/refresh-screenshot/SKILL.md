---
name: refresh-screenshot
description: Regenerate docs/screenshot.png from synthetic data. Use when the dashboard UI changed and the README screenshot no longer shows it — a new filter, a new section, a restyled card. Drives the local dev server and Chrome; never captures real GitHub data.
---

# Refreshing docs/screenshot.png

The README screenshot goes stale every time the dashboard gains a control. This
is how to redo it without putting a single real repository, organization, or
person into a public repo.

## The rule this exists for

PRison is public. Anything visible in `docs/screenshot.png` is published. The
board in the screenshot must therefore come from `scripts/screenshot/demo-board.mjs`,
which is built from the same allowlisted names (`acme`, `globex`, `initech`,
`widgets-inc`, `alice`, `bob`, `carol`, `dave`, `octocat`) that
`lib/generic-fixtures.ts` enforces everywhere else in the repo.

**Never screenshot a signed-in board showing real data**, not even to "check the
layout" — a real PR title in a discarded screenshot is still a real PR title
that reached the disk of a public checkout.

## Steps

### 1. Start the dev server

```bash
npm run dev
```

Leave it running in the background. It listens on `http://localhost:3000` unless
that port is taken — read the actual URL out of its output.

Note this is separate from the Docker container that may also be on `:3000`. If
the container is running, either stop it or let `next dev` pick another port and
use that one.

### 2. Open it in Chrome and sign in

Use the Chrome tools (`tabs_create_mcp`, then `navigate`). Sign in normally —
the dev server needs a working token to render the page shell at all.

The signed-in shell shows your own login in the header and your organizations in
the org `<select>`. That select is **closed** and reads "All organizations" in
its default state, so the real names sit in unopened `<option>` elements and
never reach the image. Leave it closed. Your login does appear; that is fine
when it is an allowlisted name, and if it is not, sign in with an account whose
name is.

### 3. Replace the board with the synthetic one

```bash
node scripts/screenshot/demo-board.mjs
```

That prints a self-contained snippet. Run it in the page with `javascript_tool`.
It patches `window.fetch` so every `/api/*` list answers from the demo board and
leaves every other request alone. It returns the list of routes it patched —
check that string before continuing; an empty or partial list means the snippet
did not take.

Then click **Refresh** in the filter bar. All six lists refetch and land on the
synthetic board. Confirm by eye that the titles are the demo ones
(`Retry the payment webhook instead of dropping it`, …) before capturing.

The demo board's ages are relative to when you ran the command, so the badges
read `2h` / `3d` rather than a frozen date.

### 4. Set up the shot

- **Dark mode** — the existing screenshot is dark; use the sun/moon toggle.
- **Window size** — wide enough that the two-column layout is in its desktop
  form, around 1600×1000. `resize_window` does this.
- Make sure the control the screenshot exists to show is **visible and in a
  state that demonstrates it**. If the change is a new filter, leave it on its
  default rather than an exotic setting, unless the exotic one is the point.
- Scroll so the filter bar and the four work-queue lists are all in frame.

### 5. Capture and replace

Screenshot with the Chrome tools, then write the image to `docs/screenshot.png`,
replacing the old one. Keep the filename — the README links to it by path.

### 6. Check before committing

- Open the PNG and **read every string in it**. Any repository, org, person, or
  PR title that is not from the demo board is a leak; go back to step 3.
- If the composition changed enough that the README's alt text no longer
  describes it, update the alt text too.
- `npx vitest run lib/generic-fixtures.test.ts` — the guard scans committed
  files and commit messages, so it catches a name that reached the demo board
  itself, though it cannot read the pixels.

## Changing what the board shows

Edit `scripts/screenshot/demo-board.mjs`. It is plain data in the shapes
`lib/types.ts` defines, one array per list, and the only rules are:

- Names come from the allowlist above. If you need a new one, add it to the
  allowlist in `lib/generic-fixtures.ts` first, and pick something that is
  obviously fictional.
- Keep at least one draft in the lists that can hold one, so the draft filter
  has something to act on.
- Keep the mix that makes the board legible: something failing, something
  pending, something approved and waiting, something merged.
