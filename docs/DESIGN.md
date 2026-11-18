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
