# Theme system — design

**Date:** 2026-08-10
**Status:** implemented

## Goal

Replace the two-state light/dark toggle with a theme system of two independent axes:
a **family** (a colour and type identity) and a **mode** (its light or dark ground).

Four families × two modes = eight palettes. Three families are new; the current
light/dark pair becomes the `default` family and does not change a single value.

## The rule the system rests on

**A family owns four colours. A mode owns the ground.**

Each family's accent and its three status colours (success / warning / danger) come from
that family's real-world source and stay the same hue in both modes — only their lightness
is adjusted so they stay legible on the ground they sit on. The mode supplies
background, surface, foreground, muted and border.

This is why the result is four identities in two lights, not eight unrelated palettes.
Flipping the mode should feel like the light changed, not like the theme changed.

## Families

### `default` — the current palette

Unchanged. Exists so the two axes stay orthogonal: every family has both modes, including
this one. Existing users see exactly what they see today.

| Token | `light` | `dark` |
| --- | --- | --- |
| bg | `#EEF2F7` | `#0F172A` |
| surface | `#FAFBFE` | `#1E293B` |
| fg | `#0F172A` | `#F1F5F9` |
| muted | `#475569` | `#94A3B8` |
| brd | `#DCE3EC` | `#334155` |
| accent | `#16A34A` | `#22C55E` |
| success | `#16A34A` | `#4ADE80` |
| warning | `#B45309` | `#FBBF24` |
| danger | `#DC2626` | `#F87171` |

Type: Fira Sans / Fira Code (today's fonts).

### `aurora` — night-sky emission lines

Every identity colour is a documented emission wavelength converted to sRGB, then
adjusted for legibility. Spectral colours fall outside the sRGB gamut, so the hue is
kept and the lightness/saturation moved — the derivation is real, the calibration is
declared.

| Source | Role | `dawn` | `night` |
| --- | --- | --- | --- |
| 427.8 nm — N₂⁺ band | accent | `#3D4FCB` | `#8A9BFF` |
| 557.7 nm — O I green line | success | `#117C54` | `#5FDE9B` |
| 589.0 nm — Na D, sodium layer | warning | `#8F640B` | `#F2C64B` |
| 630.0 nm — O I red line | danger | `#C4341F` | `#FF6B5E` |

| Token | `dawn` | `night` |
| --- | --- | --- |
| bg | `#EDF0F8` | `#0A0F1A` |
| surface | `#FAFBFF` | `#141B2D` |
| fg | `#131A2B` | `#E4ECF8` |
| muted | `#5A6683` | `#8FA2C0` |
| brd | `#D8DEEC` | `#253352` |

An aurora is a night phenomenon, so a "daytime aurora" would be invention. The light mode
instead keeps the four wavelengths and swaps the midnight sky for a dawn sky: same physics,
different hour.

Type: IBM Plex Sans / IBM Plex Mono — an instrument-readout family for a palette that is
four measurements.

### `iznik` — 16th century tile pigments

Each identity colour is a metal oxide the İznik workshops actually used.

| Source | Role | `glaze` | `cobalt` |
| --- | --- | --- | --- |
| cobalt oxide | accent | `#1E4C99` | `#7FA8E8` |
| copper oxide (turquoise) | success | `#227A77` | `#4FC4BF` |
| Kütahya ochre — *borrowed* | warning | `#926524` | `#D9A64B` |
| Armenian bole (iron oxide red) | danger | `#B03A26` | `#EA7B67` |

| Token | `glaze` | `cobalt` |
| --- | --- | --- |
| bg | `#F7F3EA` | `#12244A` |
| surface | `#FFFDF6` | `#1A3160` |
| fg | `#1D1A16` | `#F2EDE1` |
| muted | `#6B6355` | `#9BAECE` |
| brd | `#E2D9C6` | `#294479` |

Both grounds are real: the white quartz-glaze tile and the cobalt-ground panel, where the
pattern stays white and the ground turns blue.

Known gap: the İznik palette has no yellow, so `warning` is borrowed from Kütahya ochre —
the next stop in the same tradition, but not İznik.

Type: Alegreya Sans / Inconsolata — both humanist faces with calligraphic skeletons.

### `cyanotype` — 1842 blueprint

One reaction: iron salt on paper turns Prussian blue in sunlight; unexposed areas stay
paper. Both modes are real outputs — the print and its negative.

| Source | Role | `negative` | `print` |
| --- | --- | --- | --- |
| Prussian blue | accent | `#14567F` | `#7FB3D5` |
| *borrowed* | success | `#2B714F` | `#6FBF8B` |
| *borrowed* | warning | `#875C19` | `#D9A441` |
| *borrowed* | danger | `#A8402F` | `#E3938C` |

| Token | `negative` | `print` |
| --- | --- | --- |
| bg | `#E8E3D3` | `#0E2E47` |
| surface | `#F4F1E6` | `#14405E` |
| fg | `#003153` | `#DCE9F2` |
| muted | `#486881` | `#8BACC4` |
| brd | `#CFC7B2` | `#1E5378` |

**Stated plainly:** three of the four identity colours are not derived from the source.
The palette is two colours, and PRison must answer "which is failing, which is waiting,
which is ready" at a glance, so the status colours are borrowed. The "every colour is a
measurement" claim that holds for the other families does not hold here. Shipped anyway
at the owner's decision, with the gap recorded rather than hidden.

Type: Barlow / JetBrains Mono — infrastructure signage and an engineering tool's face.

## Naming

Both axes are named in the UI. The mode names belong to the family.

| Family | light mode | dark mode |
| --- | --- | --- |
| Default | Light | Dark |
| Aurora | Dawn | Night |
| İznik | Glaze | Cobalt |
| Cyanotype | Negative | Print |

The header button's `aria-label` and `title` name the destination — "Switch to Aurora
Night" — rather than saying "dark theme". Names stay English because every other string
in the app is English.

## Controls

**Family — Settings.** A new `Appearance` entry in `SECTIONS` in `SettingsModal.tsx`,
containing a native `<select>` listing the four families. No new component; keyboard
handling, focus and screen-reader support come for free.

**Mode — header.** The existing sun/moon button stays where it is and keeps its job of
being one click away. It now flips the current family's two modes.

## State and DOM contract

Two keys, two attributes:

| localStorage | values | DOM |
| --- | --- | --- |
| `prison.theme` | `default` \| `aurora` \| `iznik` \| `cyanotype` | `<html data-theme>` |
| `prison.mode` | `light` \| `dark` (absent = follow OS) | `<html data-mode>` |

`prison.theme` today holds `"light"` or `"dark"` — a mode, not a family. Those two values
are resolved on read to `{theme: "default", mode: <the old value>}`. Nothing is written
back: the first deliberate change the user makes rewrites both keys anyway, so a migration
pass would only be a second way to get to the same place. A stored `prison.mode` wins over
the legacy value, since it is the newer, deliberate choice. Everything else, including an
absent key or an unrecognised family, resolves to `default` plus the OS preference. Nobody's
theme changes across the upgrade.

The blocking script in `app/layout.tsx` keeps doing what it does today — read storage,
resolve `mode` against `matchMedia` when unset, stamp both attributes before first paint.

`lib/theme.ts` owns the shared pieces: the family and mode tables, `applyTheme`,
`applyMode`, and the subscribe/snapshot pair the components read through. The
`useSyncExternalStore` + `MutationObserver` code currently inline in `Header.tsx` moves
here and starts watching `data-theme` and `data-mode` instead of `class`.

## CSS

`globals.css` gains one block per palette: `[data-theme="aurora"][data-mode="dark"] { … }`
and so on — about ten lines each. The `@theme inline` mapping is untouched, because the
Tailwind utilities already resolve through the raw variables.

Each palette also declares `color-scheme`, so native controls (`<select>`, checkboxes,
scrollbars) match the ground.

**Fonts become runtime-switchable.** `globals.css` currently notes that font tokens are
build-time. The same `@theme inline` indirection used for colours is applied to
`--font-sans` / `--font-mono`, and each family block sets them. All eight faces are declared
with `next/font` in `layout.tsx`; the browser downloads only the family in use. Roles do not
change: one sans for the interface, one mono for data.

**A latent bug gets fixed on the way.** There are eight `dark:hover:brightness-110`
utilities across `ActivityBell`, `Header`, `Dashboard` and `SettingsModal`. No
`@custom-variant dark` is defined, so `dark:` resolves to `prefers-color-scheme`, not the
`.dark` class — the hover brightness can therefore disagree with the theme the user chose.
All eight collapse to a single `--hover-brightness` variable that each palette sets, which
is both correct today and correct for eight palettes.

## Verification

- `lib/theme.test.ts` — `applyTheme` / `applyMode` write the right attribute and key;
  an absent `prison.mode` resolves through `matchMedia`; the old `"light"` / `"dark"`
  values in `prison.theme` migrate to the right family/mode pair.
- `Header.test.tsx` — the button flips the mode and leaves the family alone; its label
  names the destination mode of the current family.
- `SettingsModal.test.tsx` — the Appearance select changes the family and leaves the mode
  alone.
- Contrast: `lib/theme.test.ts` parses the shipped stylesheet and measures all
  thirteen text pairs in every palette against WCAG AA, so a later nudge to a colour
  cannot quietly make text unreadable. Ten values moved to pass it — the tables above
  carry the measured values, not the first draft.
- `default/light` is exempt from that check. It predates this work and misses AA on
  seven pairs, including `accent` on `bg` at 2.93:1. Correcting it would change the
  colours of every existing install, which this feature explicitly does not do, so it
  is left alone and tracked separately.
- `scripts/screenshot/capture.mjs` sets `prison.theme = "dark"`; it goes through the same
  migration path, so it keeps working, and is re-run to confirm.

## Out of scope

- A high-contrast and a warm low-light theme. Both are worth having — the first for
  accessibility — but neither was asked for, and each is ten lines of CSS whenever it is.
- Transition animation between themes.
- User-defined palettes.
- Per-family display faces beyond the sans/mono pair.

## Related

Summary tiles (`Waiting on you`, `Stuck on checks`, `Awaiting your reply`, `Longest wait`)
came out of the palette mockups and are tracked separately in issue #38. They read their
colours from these tokens, so the two pieces compose but do not depend on each other.
