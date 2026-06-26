# PRison Design System

Design tokens sourced via `ui-ux-pro-max-cli` (installed), refined with the task-6 fallback palette.

## Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#f8fafc` (slate-50) | Page background |
| Surface | `#ffffff` | Cards, panels |
| Text Primary | `#0f172a` (slate-900) | Headings, body |
| Text Secondary | `#64748b` (slate-500) | Labels, metadata |
| Accent / Links | `#4f46e5` (indigo-600) | CTAs, links |

## Badge Colors (Age Buckets)

| Bucket | Background | Text |
|--------|-----------|------|
| `fresh` | `bg-green-100` (`#dcfce7`) | `text-green-800` (`#166534`) |
| `warning` | `bg-yellow-100` (`#fef9c3`) | `text-yellow-800` (`#854d0e`) |
| `urgent` | `bg-red-100` (`#fee2e2`) | `text-red-800` (`#991b1b`) |

## Font Pairing

| Role | Family | Weights |
|------|--------|---------|
| Sans (UI) | Inter | 400, 500, 600, 700 |
| Mono (code, IDs) | JetBrains Mono | 400, 500 |

Source: Google Fonts (`@import url(...)` in `app/globals.css`)

## Spacing Scale

Tailwind default — **4 px base unit** (0.25 rem). All spacing values are multiples of 4 px.

## CSS Custom Properties

All tokens are defined as CSS custom properties in `app/globals.css` under `:root`:

```css
--color-bg: #f8fafc;
--color-surface: #ffffff;
--color-text-primary: #0f172a;
--color-text-secondary: #64748b;
--color-accent: #4f46e5;
--font-sans: "Inter", ...;
--font-mono: "JetBrains Mono", ...;
--spacing-base: 4px;
```
