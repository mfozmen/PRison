#!/usr/bin/env node
// Capture docs/screenshot.png from the synthetic board, headlessly.
//
//   npm run dev                          # in another shell
//   node scripts/screenshot/capture.mjs  # reads PRISON_URL, default http://localhost:3000
//
// Drives headless Chrome over the DevTools Protocol. No browser extension, no
// Playwright, no dependency at all: Node has had a global WebSocket since 22,
// and CDP is a WebSocket. Chrome runs on a throwaway profile, so nothing here
// touches the browser you use.
//
// It signs in with a DELIBERATELY INVALID token. PRison only needs a decryptable
// session cookie to render the dashboard shell; the org query that token would
// serve fails, leaving the org switcher empty. That is the point — a real token
// would put real organizations into a file published in a public repository. The
// lists never reach GitHub either: the board is patched in before the first
// paint. See .claude/skills/refresh-screenshot.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Imported straight from the TypeScript, which Node strips itself — the session
// cookie has to decrypt, so it is minted with the app's own encryptToken rather
// than a copy of it, one AES change away from silently producing a cookie that
// reads as "signed out".
import { encryptToken } from "../../lib/token-cookie.ts";
import { pageSnippet } from "./demo-board.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const APP = process.env.PRISON_URL ?? "http://localhost:3000";
const OUT = join(ROOT, "docs", "screenshot.png");
const CHROME = process.env.CHROME_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Matches the committed screenshot: 1280 CSS px wide at 2x.
const WIDTH = 1280;
const SCALE = 2;

function authSecret() {
  const env = readFileSync(join(ROOT, ".env.local"), "utf8");
  const line = /^AUTH_SECRET=(.+)$/m.exec(env);
  if (!line) throw new Error("AUTH_SECRET missing from .env.local — run `npm run dev` once");
  return line[1].trim();
}

// Minimal CDP client: send(method, params) -> Promise<result>.
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    if (msg.error) slot.reject(new Error(msg.error.message));
    else slot.resolve(msg.result);
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`cannot reach ${wsUrl}`)), { once: true });
  });
  return {
    ready,
    close: () => ws.close(),
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function until(fn, what, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const profile = mkdtempSync(join(tmpdir(), "prison-shot-"));
const port = 9330 + (process.pid % 500);

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${WIDTH},1200`,
  "--hide-scrollbars",
  "--no-first-run",
  "--disable-extensions",
  "about:blank",
], { stdio: "ignore" });

let cdp;
try {
  const target = await until(
    async () => (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json(),
    "headless Chrome",
  );
  cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;

  await cdp.send("Network.enable");
  const { hostname } = new URL(APP);
  const cookie = { domain: hostname, path: "/", httpOnly: true, sameSite: "Lax" };
  await cdp.send("Network.setCookie", {
    ...cookie, name: "prison_token",
    // Never a real token: this one exists to decrypt, not to work.
    value: encryptToken("screenshot-only-not-a-real-token", authSecret()),
  });
  await cdp.send("Network.setCookie", { ...cookie, name: "prison_login", value: "octocat" });

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH, height: 1200, deviceScaleFactor: SCALE, mobile: false,
  });

  // Before any page script, so the theme is dark on the first paint and the
  // board is already patched when the Dashboard makes its first fetch — no
  // flash of the real (empty) board, and no Refresh click to remember.
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      localStorage.setItem("prison.theme", "dark");
      localStorage.setItem("prison.draftFilter", "all");
      ${pageSnippet()};
      // next dev floats its own overlay badge over the bottom-left corner, and
      // it is not part of the product — it would be in the published image.
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal { display: none !important; }";
        document.head.appendChild(style);
      });
    `,
  });

  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: APP });
  // The lists paint from the patched fetch, which resolves immediately, but
  // React still has to commit and the age badges are computed on mount.
  await new Promise((r) => setTimeout(r, 3_000));

  const title = await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("h2")?.textContent ?? "NO DASHBOARD"`,
    returnByValue: true,
  });
  if (title.result.value === "NO DASHBOARD") {
    throw new Error("the dashboard did not render — is the dev server up at " + APP + "?");
  }

  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
  });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log(`wrote ${OUT} (${WIDTH}px @ ${SCALE}x, first section: ${title.result.value})`);
} finally {
  cdp?.close();
  chrome.kill();
  rmSync(profile, { recursive: true, force: true });
}
