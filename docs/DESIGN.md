# PRison Design System

Design system generated with the **ui-ux-pro-max** skill
(`.claude/skills/ui-ux-pro-max/`). Full recommendation saved at
`design-system/prison/MASTER.md`. Style: **Data-Dense Dashboard (dark)** with a
green "run" accent — a developer/ops aesthetic that fits a PR + CI tool.

## Palette (dark)

| Token | Hex | Usage |
|-------|-----|-------|
| Canvas | `#0f172a` (slate-900) | App background |
| Surface | `#1e293b` (slate-800) | Cards, header |
| Surface-2 | `#243043` | Hover / inputs |
| Edge | `#334155` (slate-700) | Borders |
| Ink | `#f8fafc` (slate-50) | Primary text |
| Ink muted | `#94a3b8` (slate-400) | Labels, metadata |
| Accent | `#22c55e` (green-500) | Primary CTA ("Open PR"), links, "run" |

## Badge Colors (Age Buckets)

Color-coded urgency with inset rings; `font-mono` + `tabular-nums`.

| Bucket | Classes |
|--------|---------|
| `fresh` (< 1 day) | `bg-green-500/15 text-green-400 ring-green-500/30` |
| `warning` (1–3 days) | `bg-amber-500/15 text-amber-400 ring-amber-500/30` |
| `urgent` (> 3 days) | `bg-red-500/15 text-red-400 ring-red-500/30` |

## Font Pairing

| Role | Family | Loaded via |
|------|--------|-----------|
| Sans (UI) | Fira Sans (400/500/600/700) | `next/font/google` in `app/layout.tsx` |
| Mono (code, IDs, durations) | Fira Code | `next/font/google` |

Exposed as `--font-fira-sans` / `--font-fira-code`, mapped to Tailwind's
`--font-sans` / `--font-mono` in `app/globals.css`.

## Spacing & motion

- Tailwind default **4 px base unit**; section rhythm 8 / 12 / 32.
- Transitions 150–300 ms; global `prefers-reduced-motion` clamp.

## CSS Custom Properties

Defined in `app/globals.css` under `@theme`:

```css
--color-canvas: #0f172a;
--color-surface: #1e293b;
--color-surface-2: #243043;
--color-edge: #334155;
--color-ink: #f8fafc;
--color-ink-muted: #94a3b8;
--color-accent: #22c55e;
--font-sans: var(--font-fira-sans), ...;
--font-mono: var(--font-fira-code), ...;
```
