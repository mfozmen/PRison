# PRison Design System

The board is the v2 "tiers" layout: a Next move strip, a toolbar, four work
columns (stuck · review · reply · ready) and two history panels. The approved
drawing lives in [`docs/design/board.html`](design/board.html). It is a static
reference, and the `pixel-reviewer` agent compares the running app against it.

How to change the look, and how token roles map onto the board, is written down
in the project skill `.claude/skills/designing-prison-ui/SKILL.md`. Theme
mechanics (families × modes, contrast rules) are in
[`superpowers/specs/2026-08-10-theme-system-design.md`](superpowers/specs/2026-08-10-theme-system-design.md),
and every palette is in `app/globals.css`, measured by `lib/theme.test.ts`.

## Token roles on the board

| Token | Paints |
|-------|--------|
| `danger` | Stuck column, failing checks, NEXT MOVE badge |
| `warning` | Reply column, pending checks, "Needs update" |
| `success` | Ready column, approved verdicts |
| `accent` | Review column, "Updated since", merged icon, logo |
| `spot` | The Next move card's ground (one per family and mode, from its palette) |
| `bg` / `surface` / `brd` | Ground, cards, hairlines |
| `fg` / `muted` | Text and secondary text |

## Typography and shape

- Each theme family brings its own sans and mono pair (loaded with `next/font`).
  Mono is for repo coordinates, check names and ages.
- Column count: 56 px bold, tight tracking. Column label: 12 px semibold caps.
  Row title: 14 px medium.
- Radii: 20 px for columns, panels and the Next move strip, 12 px for buttons,
  pills fully round.
- Touch targets ≥ 44 px. Transitions 150–300 ms, with a global
  `prefers-reduced-motion` clamp.

## Where the themes come from

A theme owns its accent, its three status colours and its typefaces; the ground
underneath is a separate choice, so switching it reads as the light changing
rather than the theme changing.

| Theme | Built from |
| --- | --- |
| **Default** | The original pair. |
| **Aurora** | Four atmospheric emission wavelengths. |
| **İznik** | The metal oxides the 16th-century tile workshops fired. |
| **Cyanotype** | The 1842 blueprint reaction and its negative. |
| **Coral** | A reef and the algae that colour it; its two grounds are a depth, not a mood — at 30 m the sea has absorbed the red end of the spectrum. |
| **Saffron** | Four parts of one crocus. |
| **Lichen** | Four species off one rock face, wet and dry. |
| **Reflectivity** | A weather radar's dBZ scale. |
| **Lilac** | A colorpalettes.net palette: violet night. |
| **Olive** | A colorpalettes.net palette: olive and mustard on linen. |
| **Acid Pop** | A colorpalettes.net palette: cobalt, acid green and hot pink — the loud one. |
| **Terracotta** | A colorpalettes.net palette: peach plaster and fired clay. |
| **Moss & Rose** | A colorpalettes.net palette: blue-green moss with a blush accent. |
| **Bordeaux** | A colorpalettes.net palette: wine and mustard, the one red ground. |

The last six let their palette colour the ground as well as the accent. All
twenty-eight palettes are measured against WCAG AA by `lib/theme.test.ts`, with
nothing exempt.
