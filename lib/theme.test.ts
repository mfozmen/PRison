import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  THEMES,
  THEME_INIT_SCRIPT,
  THEME_KEY,
  MODE_KEY,
  applyMode,
  applyTheme,
  getMode,
  getServerMode,
  getServerTheme,
  getTheme,
  modeLabel,
  themeLabel,
} from "./theme";
import type { ThemeId } from "./theme";

/** Runs the real init script — the same string layout.tsx puts in <head> — so
 * a change to it can't pass here and break in the browser. */
function runInitScript(prefersDark = false): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: prefersDark && query.includes("dark"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  new Function(THEME_INIT_SCRIPT)();
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.mode;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("THEME_INIT_SCRIPT", () => {
  it("falls back to the default family and the OS ground when nothing is stored", () => {
    runInitScript(false);
    expect(document.documentElement.dataset.theme).toBe("default");
    expect(document.documentElement.dataset.mode).toBe("light");
  });

  it("follows a dark OS preference when no mode is stored", () => {
    runInitScript(true);
    expect(document.documentElement.dataset.mode).toBe("dark");
  });

  it("applies a stored family and ground", () => {
    localStorage.setItem(THEME_KEY, "aurora");
    localStorage.setItem(MODE_KEY, "dark");
    runInitScript(false);
    expect(document.documentElement.dataset.theme).toBe("aurora");
    expect(document.documentElement.dataset.mode).toBe("dark");
  });

  it("lets a stored ground beat the OS preference", () => {
    localStorage.setItem(MODE_KEY, "light");
    runInitScript(true);
    expect(document.documentElement.dataset.mode).toBe("light");
  });

  it("ignores a family it doesn't recognise", () => {
    localStorage.setItem(THEME_KEY, "solarized");
    runInitScript(false);
    expect(document.documentElement.dataset.theme).toBe("default");
  });

  // Before this feature prison.theme held "light" or "dark" — a mode, not a
  // family. Those values still arrive from every existing install, so they have
  // to keep meaning what they meant.
  it("reads a legacy prison.theme of 'dark' as the default family in its dark ground", () => {
    localStorage.setItem(THEME_KEY, "dark");
    runInitScript(false);
    expect(document.documentElement.dataset.theme).toBe("default");
    expect(document.documentElement.dataset.mode).toBe("dark");
  });

  it("lets a legacy prison.theme of 'light' beat a dark OS preference", () => {
    localStorage.setItem(THEME_KEY, "light");
    runInitScript(true);
    expect(document.documentElement.dataset.theme).toBe("default");
    expect(document.documentElement.dataset.mode).toBe("light");
  });

  // A newer prison.mode is the deliberate choice; the legacy value is a leftover.
  it("prefers a stored mode over the legacy value", () => {
    localStorage.setItem(THEME_KEY, "dark");
    localStorage.setItem(MODE_KEY, "light");
    runInitScript(false);
    expect(document.documentElement.dataset.mode).toBe("light");
  });

  it("survives localStorage throwing", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    runInitScript(false);
    expect(document.documentElement.dataset.theme).toBe("default");
    expect(document.documentElement.dataset.mode).toBe("light");
    getItem.mockRestore();
  });
});

describe("applyTheme / applyMode", () => {
  it("stamps the family on <html> and stores it", () => {
    applyTheme("iznik");
    expect(document.documentElement.dataset.theme).toBe("iznik");
    expect(localStorage.getItem(THEME_KEY)).toBe("iznik");
  });

  it("stamps the ground on <html> and stores it", () => {
    applyMode("dark");
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(localStorage.getItem(MODE_KEY)).toBe("dark");
  });

  it("leaves the other axis alone", () => {
    applyTheme("aurora");
    applyMode("dark");
    applyTheme("cyanotype");
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(localStorage.getItem(MODE_KEY)).toBe("dark");
  });
});

describe("snapshots", () => {
  it("reads back what was applied", () => {
    applyTheme("aurora");
    applyMode("dark");
    expect(getTheme()).toBe("aurora");
    expect(getMode()).toBe("dark");
  });

  it("reports the default family for an unknown attribute", () => {
    document.documentElement.dataset.theme = "solarized";
    expect(getTheme()).toBe("default");
  });

  it("treats anything that isn't 'dark' as the light ground", () => {
    document.documentElement.dataset.mode = "";
    expect(getMode()).toBe("light");
  });

  // The server has no documentElement to read, so it renders the default pair
  // and the client corrects it on hydration.
  it("server-renders the default family in its light ground", () => {
    expect(getServerTheme()).toBe("default");
    expect(getServerMode()).toBe("light");
  });
});

describe("labels", () => {
  it("names the ground in the family's own words", () => {
    expect(modeLabel("aurora", "dark")).toBe("Night");
    expect(modeLabel("aurora", "light")).toBe("Dawn");
    expect(modeLabel("iznik", "dark")).toBe("Cobalt");
    expect(modeLabel("cyanotype", "light")).toBe("Negative");
    expect(modeLabel("default", "dark")).toBe("Dark");
  });

  // The id comes out of localStorage, which is hand-editable: a theme that
  // was renamed or never existed must still name a ground, not undefined.
  it("falls back to the default family for an id it does not know", () => {
    expect(modeLabel("gone" as ThemeId, "dark")).toBe("Dark");
    expect(themeLabel("gone" as ThemeId)).toBe("Default");
  });

  it("names the family", () => {
    expect(themeLabel("iznik")).toBe("İznik");
    expect(themeLabel("default")).toBe("Default");
  });

  it("gives every family both grounds a distinct name", () => {
    for (const family of THEMES) {
      expect(family.light).not.toBe(family.dark);
      expect(family.label.length).toBeGreaterThan(0);
    }
  });
});

// Colour choices rot silently: nothing else in the suite notices if a palette
// is nudged until its text stops being readable. This reads the stylesheet that
// actually ships and measures it.
describe("palette contrast", () => {
  const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

  function palettes(): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    const blocks = /(:root|\[data-theme="([\w-]+)"\]\[data-mode="(\w+)"\])\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = blocks.exec(css))) {
      const name = m[1] === ":root" ? "default/light" : `${m[2]}/${m[3]}`;
      const vars: Record<string, string> = {};
      for (const line of m[4].split(";")) {
        const [k, v] = line.split(":").map((s) => s?.trim());
        if (k?.startsWith("--") && v?.startsWith("#")) vars[k.slice(2)] = v;
      }
      if (Object.keys(vars).length) out[name] = vars;
    }
    return out;
  }

  function contrast(a: string, b: string): number {
    const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const luminance = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, bl] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => channel(v / 255));
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  // Every foreground/background pair the dashboard actually renders as text.
  const PAIRS: Array<[string, string]> = [
    ["fg", "bg"], ["fg", "surface"],
    ["muted", "bg"], ["muted", "surface"],
    ["accent", "bg"], ["accent", "surface"],
    ["danger", "bg"], ["danger", "surface"],
    ["warning", "bg"], ["warning", "surface"],
    ["success", "bg"], ["success", "surface"],
    // The selected settings tab and the primary button are bg-accent text-background.
    ["bg", "accent"],
  ];

  // The Settings swatches are nested elements stamped with data-theme/data-mode,
  // so they only pick up a typeface if a rule matches on the family *alone*.
  // Without one, a swatch inherits the font of whatever family the page is on
  // and previews the wrong typeface — which looks plausible and is wrong.
  it("gives every family a mode-independent typeface rule", () => {
    for (const { id } of THEMES) {
      // String.raw: in a plain template literal `\[` collapses to `[` and `\s`
      // to `s`, which silently turns this into a character class that matches
      // nothing useful.
      const block = new RegExp(
        String.raw`\[data-theme="${id}"\]\s*\{([^}]*)\}`,
      ).exec(css);
      expect(block, `no family-level block for ${id}`).not.toBeNull();
      expect(block![1], `${id} sets no --fsans`).toContain("--fsans");
      expect(block![1], `${id} sets no --fmono`).toContain("--fmono");
    }
  });

  it("defines a complete palette for all eight family/ground pairs", () => {
    const found = Object.keys(palettes()).sort();
    expect(found).toEqual(
      [
        "default/light", "default/dark",
        "aurora/light", "aurora/dark",
        "iznik/light", "iznik/dark",
        "cyanotype/light", "cyanotype/dark",
      ].sort(),
    );
  });

  // All eight, with nothing exempt. default/light used to be: it predates the
  // theme system and missed AA on seven pairs, and was left alone so that
  // adding themes changed nobody's colours. #40 corrected it, which is what
  // let this list stop having an exception to explain.
  it.each([
    "default/light",
    "default/dark",
    "aurora/light",
    "aurora/dark",
    "iznik/light",
    "iznik/dark",
    "cyanotype/light",
    "cyanotype/dark",
  ])("%s clears WCAG AA on every text pair", (name) => {
    const vars = palettes()[name];
    expect(vars, `${name} has no palette block`).toBeDefined();

    // Each palette block only redefines what differs, so anything it omits is
    // inherited from :root — resolve against that, exactly as the cascade does.
    const base = palettes()["default/light"];
    const failures = PAIRS.map(([fg, bg]) => {
      const a = vars[fg] ?? base[fg];
      const b = vars[bg] ?? base[bg];
      const r = contrast(a, b);
      return r < 4.5 ? `${fg} on ${bg} = ${r.toFixed(2)} (${a} / ${b})` : null;
    }).filter(Boolean);

    expect(failures).toEqual([]);
  });
});
