/**
 * Theming has two independent axes: a *family* (a colour and type identity) and
 * a *mode* (its light or dark ground). A family owns its accent and its three
 * status colours; a mode owns background, surface, foreground, muted and
 * border. Flipping the mode should read as the light changing, not the theme.
 *
 * Both axes are named, because "Switch to Aurora Night" tells the user more
 * than "Switch to dark theme" — and with four families there is no single
 * "dark theme" left to name.
 */

export const THEMES = [
  { id: "default", label: "Default", light: "Light", dark: "Dark" },
  { id: "aurora", label: "Aurora", light: "Dawn", dark: "Night" },
  { id: "iznik", label: "İznik", light: "Glaze", dark: "Cobalt" },
  { id: "cyanotype", label: "Cyanotype", light: "Negative", dark: "Print" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export type Mode = "light" | "dark";

export const THEME_KEY = "prison.theme";
export const MODE_KEY = "prison.mode";

function family(theme: ThemeId) {
  return THEMES.find((t) => t.id === theme) ?? THEMES[0];
}

/** The mode's name in the given family — "Night" under Aurora, "Cobalt" under
 * İznik. Falls back to the default family for an unknown id. */
export function modeLabel(theme: ThemeId, mode: Mode): string {
  const f = family(theme);
  return mode === "dark" ? f.dark : f.light;
}

export function themeLabel(theme: ThemeId): string {
  return family(theme).label;
}

/**
 * Runs in <head> before first paint, so the page never flashes the wrong
 * ground. An inline script can't import, so it lives here as a string rather
 * than hand-written into layout.tsx — that keeps this the only copy, and lets
 * theme.test.ts execute this exact source instead of a lookalike.
 *
 * Before this feature `prison.theme` held "light" or "dark", which named a mode
 * rather than a family. Those two values are still read and resolved to the
 * default family; nothing is written back, because the first deliberate change
 * the user makes rewrites both keys anyway.
 */
export const THEME_INIT_SCRIPT = `(function(){
var ids=${JSON.stringify(THEMES.map((t) => t.id))};
var d=document.documentElement,t=null,m=null;
try{t=localStorage.getItem(${JSON.stringify(THEME_KEY)});m=localStorage.getItem(${JSON.stringify(MODE_KEY)});}catch(e){}
if(t==='light'||t==='dark'){if(!m){m=t;}t=null;}
if(ids.indexOf(t)<0){t='default';}
if(m!=='light'&&m!=='dark'){m=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
d.dataset.theme=t;d.dataset.mode=m;
})()`;

/** Both axes live on <html>, so one observer covers them. */
export function subscribeToTheme(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-mode"],
  });
  return () => observer.disconnect();
}

export function getTheme(): ThemeId {
  const theme = document.documentElement.dataset.theme;
  return THEMES.some((t) => t.id === theme) ? (theme as ThemeId) : "default";
}

export function getMode(): Mode {
  return document.documentElement.dataset.mode === "dark" ? "dark" : "light";
}

// A server render has no documentElement to read, so the SSR snapshot is always
// the default family in its light mode — the client corrects it on hydration,
// and THEME_INIT_SCRIPT has already painted the right one.
export function getServerTheme(): ThemeId {
  return "default";
}

export function getServerMode(): Mode {
  return "light";
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

export function applyMode(mode: Mode): void {
  document.documentElement.dataset.mode = mode;
  localStorage.setItem(MODE_KEY, mode);
}
