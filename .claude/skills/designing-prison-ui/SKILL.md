---
name: designing-prison-ui
description: Use when changing how the PRison board looks: a redesign, a new section or column, restyling cards, adding or retuning a colour theme family, picking palettes or fonts, or when asked for design alternatives or mockups before implementing.
---

# Designing PRison UI

## Overview

Draw it first, agree on it, then build it, then check it against the drawing.
The theme mechanics (files, contrast test, mode naming) are already written down
in `docs/superpowers/specs/2026-08-10-theme-system-design.md` and enforced by
`lib/theme.test.ts`. This skill covers what those files leave out: how the board
is laid out, which token paints what, and how to choose palettes that don't
all look alike.

## Workflow for a visual change

1. **Gather inspiration.** If the user gives a gallery link (muz.li,
   colorpalettes.net…), open it in the browser and screenshot a contact sheet.
   Name the patterns you take from it, e.g. "big number with a small unit" or
   "highlighted tier with a glow".
2. **Draw 2–3 directions** on a Design canvas artifact, each different in
   structure, not just colour. Use demo-board data (`scripts/screenshot/demo-board.mjs`),
   never real PRs. Recommend one, say why, and say what you would borrow from the others.
3. **Iterate on the chosen artboard** until the user approves it. Draw collapsed
   sections open too, so their contents are designed rather than guessed.
4. **Freeze a reference.** Save the approved artboard as plain static HTML in
   `docs/design/` (no runtime, demo data only). It is the spec the pixel review
   compares against.
5. **Implement on a branch**, then run the `pixel-reviewer` agent and fix what it
   finds before refreshing `docs/screenshot.png` (refresh-screenshot skill).

## Board anatomy (v2 "tiers" layout)

| Region | What it is |
|---|---|
| Next move | One strip on top showing the oldest item across the four queues, its CTA, and Skip |
| Toolbar | "N things want you", pill toggles (group by, drafts), search, Refresh |
| Tier columns | Stuck · Review · Reply · Ready. Each card has a dot label, a big count, "oldest X", a one-line description, and compact rows |
| History | Recently reviewed + Recently merged/closed side by side. No urgency colour, no CTA |

The column that holds the Next move item gets the tinted border. Rows have no
left border stripe. Status is shown by an icon, so colour is never the only signal.

## Token → meaning (do not remap casually)

| Token | Paints |
|---|---|
| `danger` | Stuck column, failing checks, NEXT MOVE badge (`bg` on `danger`) |
| `warning` | Reply column, pending checks, "Needs update" |
| `success` | Ready column, approved verdicts |
| `accent` | Review column, "Updated since" (`bg` on `accent`), merged icon |

So within one palette, **accent, success, warning and danger must be four
distinguishable colours**, different in hue *and* lightness. An accent equal to
success makes the Review and Ready dots identical.

## Choosing a theme family

- **Start from a real palette** (colorpalettes.net, or a physical source with a
  story). Record the source in the CSS comment.
- **Let the palette paint the ground** (bg, surface, brd), not only the accent.
  A neutral grey ground with a new accent is the same theme again.
- **Make each family unlike the others.** Before adding one, list the existing
  grounds and accents. The new one must differ in ground hue, not only accent.
- If a palette colour collides with a status meaning, move the status colour and
  say so in the comment ("ready moves to teal so it does not blur into the olive").
- Keep the hues in both modes; only lightness moves (see the spec).
- Pick a font pair no other family uses, loaded via `next/font` with `preload: false`.

## Common mistakes

- Generic red/amber/green/blue status colours on every family → all themes look alike.
- Changing a palette without running `npx vitest run lib/theme.test.ts`.
- A `/* comment */` inside a `[data-theme][data-mode]` block: the contrast test
  parses those blocks line by line, and a comment glued to a declaration hides
  it. Keep comments above the block.
- A new text-on-colour pair in the UI (e.g. `bg` on `danger` for a badge) without
  adding it to `PAIRS` in `lib/theme.test.ts`.
- Repeating an item's title elsewhere on the board (as Next move does) breaks
  `getByText(title)` in tests. Scope queries with `within(section)`, or stub the
  repeating component in tests that are about something else.
- Implementing straight from chat without an approved drawing → rework.
- Calling it done without a pixel review against `docs/design/`.
