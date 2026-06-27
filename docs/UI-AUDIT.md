# PRison UI/UX Audit

Audit performed with the **ui-ux-pro-max** skill (checked in at
`.claude/skills/ui-ux-pro-max/`). The recommended design system for a
developer PR dashboard is saved at `design-system/prison/MASTER.md`:
**Data-Dense Dashboard** style, dark surfaces, a green "run" accent, and the
Fira Sans / Fira Code type pairing.

## Resolved in this pass

| # | Finding | Fix |
|---|---------|-----|
| 1 | Google Fonts loaded via a CSS `@import` after `@import "tailwindcss"` — broke the Turbopack dev server with a CSS parse error. | Load Fira Sans / Fira Code with `next/font/google` in `app/layout.tsx` (no render-blocking import, no FOIT). |
| 2 | Light slate/indigo theme — generic for a developer/ops tool. | Adopted the skill's **dark Data-Dense Dashboard** palette with a green (`#22C55E`) "run" accent. |
| 3 | Age badges were flat pastel chips. | Color-coded urgency (green/amber/red) with inset rings, `font-mono` + `tabular-nums` so durations don't shift width. |
| 4 | No hover/focus affordances on interactive elements. | Row hover-highlight, `focus-visible` rings on links/buttons, `cursor-pointer` on the org select. |
| 5 | No motion-reduction support. | Global `@media (prefers-reduced-motion: reduce)` clamps transitions/animations. |
| 6 | List headers were plain; hard to scan counts. | Uppercase section labels with a monospace count badge. |
| 7 | Review rows showed a redundant `"alice · warning age"` (the age badge already conveys age). | Simplified to `"Requested by alice"`. |
| 8 | Scaffold metadata (`title: "Create Next App"`). | Proper `title` / `description` for PRison. |

## Open follow-ups (tracked in the plan)

- **Light-mode variant** — the design system supports light + dark; only dark is implemented. Add a `prefers-color-scheme` / toggle variant with independently-verified contrast.
- **SVG icons** — "Open PR" and the suggestion links are text-only; add Lucide/Phosphor icons (e.g. external-link, git-pull-request) and replace the empty-state emoji per the no-emoji-as-icon guideline.
- **Loading state** — currently a pulse dot; use skeleton rows for fetches over ~1s (progressive loading).
- **OrgSwitcher label** — `aria-label` only; add a visible `<label>` if it ever sits in a settings form.
- **Responsive pass** — verify 375 / 768 / 1024 / 1440 breakpoints; the header hides the username under `sm`.

## Accessibility status

- Contrast: primary text `#F8FAFC` on `#0F172A` and badge text on tinted backgrounds meet WCAG AA.
- Color is never the only signal — badges pair color with the duration text; check detail is text.
- Focus rings preserved and visible; the org select is keyboard-operable and labelled.
- Reduced motion respected.
